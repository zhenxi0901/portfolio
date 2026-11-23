// Stands in for the webhook behind the contact form: keeps what it is sent, and lists it when asked. `node support/webhook.ts`.
import { createServer } from "node:http";

const PORT = 8098;
const received: string[] = [];

createServer((request, response) => {
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(received));
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (part: string) => (body += part));
  request.on("end", () => {
    received.push(body);
    response.writeHead(204).end();
  });
}).listen(PORT, () => console.log(`The stand-in webhook is on http://localhost:${PORT}`));
