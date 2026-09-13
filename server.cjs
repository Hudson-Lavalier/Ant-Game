/*
 * LOCAL PREVIEW SERVER
 * npm start runs this read-only static server at localhost:4173. The resolved path
 * check prevents requests from escaping the game folder before a file is read.
 */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname,port=Number(process.env.PORT)||4173;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
http.createServer((req,res)=>{let target;try{target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}if(target===root)target=path.join(root,'index.html');if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(target,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'text/plain'});res.end(data);});}).listen(port,'127.0.0.1',()=>console.log(`Underfoot is ready: http://127.0.0.1:${port}`));
