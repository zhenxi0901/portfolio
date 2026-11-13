import { movedFromHome } from "@/lib/sections";

/**
 * Links from before the split into chapters (/#research, /#platform-cost, /#case-gke) still work.
 * An inline script sends them on to the section's page before the rest of this page loads, and
 * keeps any query string. Tab deep links (#platform-*, #ai-*) follow their section; anything that
 * cannot be read, or was never moved, stays here.
 */
export function LegacyAnchors() {
  const moved = JSON.stringify(movedFromHome());
  const js =
    `(function(){var m=${moved},h=location.hash.slice(1),p;if(!h)return;try{h=decodeURIComponent(h)}catch(e){return}` +
    `p=Object.prototype.hasOwnProperty.call(m,h)?m[h]:h.indexOf("platform-")===0?"/iot":h.indexOf("ai-")===0?"/ai":"";` +
    `if(p)location.replace(p+location.search+"#"+encodeURIComponent(h))})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
