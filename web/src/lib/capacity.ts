// A first-order model of serving long-running agents on one GPU, for the research chapter's
// capacity lab. Back-of-the-envelope inference arithmetic (kipp.ly/transformer-inference-arithmetic):
//   memory   weights + a KV cache that grows with every turn of every agent
//   decode   memory-bound: each step reads the weights and every active KV cache once
//   prefill  compute-bound: 2 FLOPs per parameter per token, plus attention over the context
// Real servers (SGLang, vLLM) batch, chunk and overlap far more cleverly; this is for the shape of
// the answer, not its third digit. Model shapes are from each model's config.json; GPU numbers are
// from NVIDIA's spec pages (dense BF16, half the "with sparsity" figure).

export type Model = {
  id: string;
  name: string;
  paramsB: number;
  layers: number;
  heads: number;
  kvHeads: number;
  headDim: number;
  maxContext: number;
};

export type Gpu = { id: string; name: string; memGB: number; bandwidthGBs: number; bf16TFlops: number };

export const models: Model[] = [
  { id: "qwen3-4b", name: "Qwen3-4B", paramsB: 4.0, layers: 36, heads: 32, kvHeads: 8, headDim: 128, maxContext: 40_960 },
  { id: "qwen3-8b", name: "Qwen3-8B", paramsB: 8.2, layers: 36, heads: 32, kvHeads: 8, headDim: 128, maxContext: 40_960 },
  { id: "qwen3-32b", name: "Qwen3-32B", paramsB: 32.8, layers: 64, heads: 64, kvHeads: 8, headDim: 128, maxContext: 40_960 },
  { id: "llama3.1-8b", name: "Llama 3.1 8B", paramsB: 8.0, layers: 32, heads: 32, kvHeads: 8, headDim: 128, maxContext: 131_072 },
  { id: "llama3.1-70b", name: "Llama 3.1 70B", paramsB: 70.6, layers: 80, heads: 64, kvHeads: 8, headDim: 128, maxContext: 131_072 },
];

export const gpus: Gpu[] = [
  { id: "a100-80", name: "A100 80GB SXM", memGB: 80, bandwidthGBs: 2039, bf16TFlops: 312 },
  { id: "h100", name: "H100 SXM", memGB: 80, bandwidthGBs: 3350, bf16TFlops: 989.5 },
  { id: "l4", name: "L4", memGB: 24, bandwidthGBs: 300, bf16TFlops: 121 },
];

/** The assumptions, named so the page can print them. */
export const assumptions = {
  memoryFraction: 0.9, // share of GPU memory a server gives to weights and KV cache
  activationsGB: 1, // set aside for activations and buffers
  bandwidthEfficiency: 0.75, // share of peak memory bandwidth a decode step achieves
  computeEfficiency: 0.5, // share of peak BF16 compute a prefill achieves
  kvBytes: 2, // KV cache in BF16
};

export type Inputs = {
  model: Model;
  gpu: Gpu;
  fp8: boolean; // FP8 weights: half the bytes (prefill still at BF16 speed)
  head: number; // tokens before the first turn: system prompt and tool schemas
  turns: number;
  perTurn: number; // tokens each turn adds: the model's reply and the tool's result
  reply: number; // of which the model generates
  cacheHit: number; // share of input tokens served from the prefix cache
  outsideSeconds: number; // per turn, time the agent spends outside the model: tools, commands
  agents: number; // agents sharing the GPU at once
  pricePerHour: number; // US$ per GPU-hour
};

export type Result = {
  weightsGB: number;
  kvPerTokenKB: number;
  finalContext: number;
  outgrowsWindowAtTurn: number | null; // the turn whose prompt no longer fits the model's window
  kvPerAgentGB: number; // at the end of a task
  kvBudgetGB: number; // what is left for KV cache after the weights; negative if the weights don't fit
  agentsThatFit: number;
  kvInUseGB: number; // every agent at the end of its task: the worst case
  fits: boolean; // the weights fit at all
  overBudget: boolean; // the agents' histories outgrow the cache: it evicts, and hits fall
  decodeStepMs: number; // one decode step with every agent in the batch
  tokPerSecEach: number;
  tokPerSecTotal: number;
  aloneTokPerSec: number; // one agent on its own
  prefillPerTurnMs: number; // average turn, with the cache hitting at cacheHit
  missLastTurnMs: number; // the last turn if the cache had nothing
  modelSecondsPerTurn: number; // what one agent waits for the model each turn
  taskSeconds: number; // one task, wall clock
  gpuBusyShare: number; // share of the time the GPU is working, with this many agents
  aloneBusyShare: number; // the same with one agent at a time
  tasksPerHour: number;
  costPerTask: number;
};

const GB = 1e9;

export function estimate(i: Inputs): Result {
  const a = assumptions;
  const params = i.model.paramsB * 1e9;
  const weights = params * (i.fp8 ? 1 : 2);
  const kvPerToken = 2 * i.model.layers * i.model.kvHeads * i.model.headDim * a.kvBytes;
  const qDim = i.model.heads * i.model.headDim;
  const prompt = (t: number) => i.head + t * i.perTurn; // the prompt the model sees on turn t (0-based)
  const finalContext = prompt(i.turns);
  const overflow = Array.from({ length: i.turns }, (_, t) => t).find((t) => prompt(t) > i.model.maxContext);

  const kvPerAgent = finalContext * kvPerToken;
  const kvBudget = i.gpu.memGB * GB * a.memoryFraction - a.activationsGB * GB - weights;
  const agentsThatFit = kvBudget > 0 ? Math.floor(kvBudget / kvPerAgent) : 0;

  // Decode: a step reads the weights once and each agent's cache once. Agents are spread across
  // their tasks, so on average a cache is half its final size.
  const bandwidth = i.gpu.bandwidthGBs * GB * a.bandwidthEfficiency;
  const avgContext = i.head + (i.turns * i.perTurn) / 2;
  const step = (n: number) => (weights + n * avgContext * kvPerToken) / bandwidth;
  const stepAll = step(i.agents);

  // Prefill: the tokens the cache misses, each costing 2 FLOPs per parameter plus attention over
  // the context (QK and AV: 4 x layers x context x query width).
  const compute = i.gpu.bf16TFlops * 1e12 * a.computeEfficiency;
  const prefill = (tokens: number, context: number) => (tokens * (2 * params + 4 * i.model.layers * context * qDim)) / compute;
  let prefillTotal = 0;
  for (let t = 0; t < i.turns; t++) prefillTotal += prefill((1 - i.cacheHit) * prompt(t), prompt(t));
  const prefillPerTurn = prefillTotal / i.turns;
  const missLastTurn = prefill(prompt(i.turns - 1), prompt(i.turns - 1) / 2);

  const turnModel = (n: number) => prefillPerTurn + i.reply * step(n);
  const taskSeconds = i.turns * (turnModel(i.agents) + i.outsideSeconds);
  // GPU work a task causes: its prefills, and its share of each batched decode step.
  const gpuWork = (n: number) => i.turns * (prefillPerTurn + (i.reply * step(n)) / n);
  const busy = (n: number) => Math.min(1, (n * gpuWork(n)) / (i.turns * (turnModel(n) + i.outsideSeconds)));
  const tasksPerHour = (i.agents * 3600) / taskSeconds;

  return {
    weightsGB: weights / GB,
    kvPerTokenKB: kvPerToken / 1024,
    finalContext,
    outgrowsWindowAtTurn: overflow === undefined ? null : overflow + 1,
    kvPerAgentGB: kvPerAgent / GB,
    kvBudgetGB: kvBudget / GB,
    agentsThatFit,
    kvInUseGB: (i.agents * kvPerAgent) / GB,
    fits: kvBudget > 0,
    overBudget: kvBudget <= 0 || i.agents * kvPerAgent > kvBudget,
    decodeStepMs: stepAll * 1000,
    tokPerSecEach: 1 / stepAll,
    tokPerSecTotal: i.agents / stepAll,
    aloneTokPerSec: 1 / step(1),
    prefillPerTurnMs: prefillPerTurn * 1000,
    missLastTurnMs: missLastTurn * 1000,
    modelSecondsPerTurn: turnModel(i.agents),
    taskSeconds,
    gpuBusyShare: busy(i.agents),
    aloneBusyShare: busy(1),
    tasksPerHour,
    costPerTask: i.pricePerHour / tasksPerHour,
  };
}
