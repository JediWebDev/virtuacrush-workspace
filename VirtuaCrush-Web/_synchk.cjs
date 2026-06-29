const ts = require('typescript');
const fs = require('fs');
const files = [
  'src/types/character.ts',
  'server/inworld/characters.ts',
  'server/inworld/lore.ts',
  'server/inworld/meet_arc.ts',
  'server/inworld/arcs.ts',
  'server/sim/scene_registry.ts',
];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diags = sf.parseDiagnostics || [];
  if (!diags.length) { console.log(`OK   ${f}`); continue; }
  for (const d of diags) {
    const pos = sf.getLineAndCharacterOfPosition(d.start);
    console.log(`ERR  ${f}:${pos.line+1}:${pos.character+1}  ${ts.flattenDiagnosticMessageText(d.messageText,'\n')}`);
  }
}
