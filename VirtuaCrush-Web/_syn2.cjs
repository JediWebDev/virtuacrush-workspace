const ts = require('typescript'); const fs = require('fs');
const files = ['server/sim/interruptions.ts','server/sim/chaos_engine.ts','server/sim/scene_context.ts','server/sim/scene_composer.ts','server/db/scene_composition.ts','server/routes/chat.ts'];
let bad=0;
for (const f of files){const src=fs.readFileSync(f,'utf8');const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const d=sf.parseDiagnostics||[];if(!d.length){console.log('OK   '+f);}else{bad++;for(const x of d){const p=sf.getLineAndCharacterOfPosition(x.start);console.log('ERR  '+f+':'+(p.line+1)+':'+(p.character+1)+'  '+ts.flattenDiagnosticMessageText(x.messageText,'\n'));}}}
console.log(bad? 'SYNTAX ERRORS':'ALL CLEAN');
