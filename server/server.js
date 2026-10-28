const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads',(req,res)=>res.status(404).json({error:'Not found.'}));
app.use(express.static(path.resolve(__dirname, '../client')));

const seedWorkspace = {
  profile: { name: 'Alex Kim', title: 'Computer Science Student', email: 'alex.kim@example.com', bio: 'Aspiring full-stack developer who loves turning thoughtful ideas into useful products. Currently learning, building, and growing one project at a time.', github: 'alexkim-dev', linkedin: 'alex-kim-dev', leetcode: 'alexkim', skills: ['JavaScript','React','Node.js','Express','MongoDB','HTML & CSS','Git','REST APIs'], githubUrl: 'https://github.com/alexkim-dev', linkedinUrl: 'https://www.linkedin.com/in/alex-kim-dev', leetcodeUrl: 'https://leetcode.com/alexkim', websiteUrl: '', targetRole: 'MERN Stack Developer', linksStatus: {}, leetcodeStats: {} },
  projects: [
    { name: 'TaskFlow', description: 'A collaborative task manager that helps small teams plan work, track progress, and celebrate wins.', tags: ['React','Node.js','MongoDB'], status: 'Completed', repo: 'https://github.com/alexkim-dev/taskflow', demo: 'https://taskflow.example.com' },
    { name: 'Weatherly', description: 'A clean weather dashboard with location search and a five-day forecast.', tags: ['React','CSS','API'], status: 'Completed', repo: 'https://github.com/alexkim-dev/weatherly', demo: '' },
    { name: 'DevNotes', description: 'A markdown-powered notebook built for developers and their everyday ideas.', tags: ['JavaScript','Express','MongoDB'], status: 'In progress', repo: '', demo: '' },
    { name: 'Color Studio', description: 'An accessible color palette generator for designers and frontend developers.', tags: ['HTML & CSS','JavaScript'], status: 'Completed', repo: '', demo: '' }
  ],
  certifications: [{ name: 'Meta Front-End Developer', issuer: 'Meta · Coursera', date: '2025-04', credential: '', url: '' }, { name: 'JavaScript Algorithms and Data Structures', issuer: 'freeCodeCamp', date: '2025-02', credential: '', url: '' }],
  role: 'MERN Stack Developer', completed: [0,1], activities: [], analysis: null, public: true, roadmap: null, resume: null,
  settings: { theme: 'light', chatEndpoint: '', emailUpdates: false }, supportMessages: [], chatHistory: []
};
const userSchema = new mongoose.Schema({ name: {type:String, required:true}, email: {type:String, required:true, unique:true, lowercase:true, trim:true}, passwordHash: {type:String, required:true}, workspace: {type:mongoose.Schema.Types.Mixed, default:()=>structuredClone(seedWorkspace)} }, { timestamps:true });
const User = mongoose.model('User', userSchema);
const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (req,file,cb) => cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`) }), limits:{fileSize:10*1024*1024}, fileFilter:(req,file,cb)=>cb(null,/\.(pdf|docx|txt)$/i.test(file.originalname)) });

function auth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  try{const data=jwt.verify(token,JWT_SECRET);req.user={id:data.sub};next()}catch{return res.status(401).json({error:'Please sign in again.'})}
}
function tokenFor(user){return jwt.sign({sub:user.id},JWT_SECRET,{expiresIn:'7d'})}
function publicUser(user){return {id:user.id,name:user.name,email:user.email,workspace:user.workspace,token:tokenFor(user)}}
async function clearSeedDeveloperLinks(user){
  if(!user.workspace?.profile||user.email===seedWorkspace.profile.email)return;
  const profile=user.workspace.profile;
  const demoLinks={github:'alexkim-dev',linkedin:'alex-kim-dev',leetcode:'alexkim',githubUrl:'https://github.com/alexkim-dev',linkedinUrl:'https://www.linkedin.com/in/alex-kim-dev',leetcodeUrl:'https://leetcode.com/alexkim'};
  let changed=false;
  for(const [field,value] of Object.entries(demoLinks))if(profile[field]===value){profile[field]='';changed=true;}
  if(changed){user.markModified('workspace');await user.save();}
}
function makeRoadmap(skills,role){
  const needed={
    'MERN Stack Developer':['JavaScript','React','Node.js','Express','MongoDB','REST APIs','Authentication','Testing','Deployment'],
    'Frontend Developer':['JavaScript','React','HTML & CSS','Accessibility','TypeScript','Testing','Performance'],
    'Backend Developer':['Node.js','Express','REST APIs','MongoDB','SQL','Authentication','Testing','Docker','Cloud basics'],
    'Data Analyst':['Python','SQL','Statistics','Excel','Data visualization','Pandas','Data cleaning','Power BI']
  };
  const gaps=(needed[role]||needed['MERN Stack Developer']).filter(skill=>!skills.some(s=>s.toLowerCase()===skill.toLowerCase()));
  return gaps.slice(0,6).map((skill,i)=>({title:`${skill} foundations`,description:`Learn the core ${skill} concepts, then build a small ${role} example that uses them. Add the result to your portfolio and explain your choices.`,duration:['3–4 hrs','4–5 hrs','5–6 hrs'][i%3]}));
}
async function aiReview(text,role,skills){
  const fallbackSkills=[...new Set(skills)];
  const provider=(process.env.AI_PROVIDER||'openai').toLowerCase();
  const isGemini=provider==='gemini';
  const apiKey=isGemini?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY;
  const models=isGemini?[...new Set([process.env.GEMINI_MODEL||'gemini-3.8-flash',process.env.GEMINI_FALLBACK_MODEL||'gemini-3.1-flash-lite'])]:[process.env.OPENAI_MODEL||'gpt-4o-mini'];
  const endpoint=isGemini?'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions':'https://api.openai.com/v1/chat/completions';
  let aiFailure=`${isGemini?'GEMINI_API_KEY':'OPENAI_API_KEY'} not configured`;
  const recognized=['JavaScript','TypeScript','React','Node.js','Express','MongoDB','HTML & CSS','Git','REST APIs','Python','SQL','Docker','AWS','Testing','Authentication'];
  for(const skill of recognized)if(new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(text)&&!fallbackSkills.some(x=>x.toLowerCase()===skill.toLowerCase()))fallbackSkills.push(skill);
  if(apiKey){
    try{
      if(!['openai','gemini'].includes(provider))throw new Error(`Unsupported AI_PROVIDER "${provider}". Choose "openai" or "gemini".`);
      let response,data,usedModel;
      modelLoop: for(const model of models){
        const requestBody=JSON.stringify({model,response_format:{type:'json_object'},messages:[{role:'system',content:'Review a resume for a target developer job. Return JSON only: {summary:string, skills:string[], strengths:string[], improvements:string[], roadmap:[{title:string,description:string,duration:string}]}. Be specific, constructive, and never invent experience. Use at most 8 skills and 6 roadmap steps.'},{role:'user',content:`Target role: ${role}\nCurrent profile skills: ${skills.join(', ')}\nResume text:\n${text.slice(0,18000)}`}],temperature:0.3});
        for(let attempt=0;attempt<3;attempt++){
          try{response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:requestBody,signal:AbortSignal.timeout(isGemini?45000:30000)})}
          catch(error){
            if(error.name==='TimeoutError'){
              if(isGemini&&model!==models.at(-1)){console.warn(`Gemini model ${model} timed out; trying fallback model ${models[models.indexOf(model)+1]}.`);break}
              throw new Error(`${isGemini?'Gemini':'OpenAI'} model ${model} did not respond within ${isGemini?'45':'30'} seconds. Try again later or choose a faster model.`)
            }
            if(attempt<2){await new Promise(resolve=>setTimeout(resolve,700*(2**attempt)+Math.random()*300));continue}
            throw new Error(`Could not reach ${isGemini?'Gemini':'OpenAI'} after 3 attempts (${error.name}). Check that the server can reach ${isGemini?'generativelanguage.googleapis.com':'api.openai.com'} on port 443.`)
          }
          data=await response.json();
          if(response.ok){usedModel=model;break}
          if(isGemini&&response.status===503&&attempt<2){await new Promise(resolve=>setTimeout(resolve,800*(2**attempt)+Math.random()*300));continue}
          if(isGemini&&response.status===503&&model!==models.at(-1)){console.warn(`Gemini model ${model} remained overloaded; trying fallback model ${models[models.indexOf(model)+1]}.`);break}
          const code=data.error?.code;const service=isGemini?'Gemini':'OpenAI';const reason=code==='insufficient_quota'?`${service} API credit balance is exhausted. Check the API account billing.`:code==='rate_limit_exceeded'?`${service} request rate limit exceeded. Wait before retrying and check the API account limits.`:isGemini&&response.status===503?`Gemini model ${model} and its fallback were overloaded after retries (HTTP 503). Wait and try again, or set GEMINI_FALLBACK_MODEL to another available model.`:`${service} request failed (HTTP ${response.status}${code?`, ${code}`:''}). Check the selected provider's key, model, billing, and limits.`;throw new Error(reason)
        }
        if(usedModel)break modelLoop;
      }
      const result=JSON.parse(data.choices?.[0]?.message?.content||'{}');
      if(!result.summary&&!result.skills?.length)throw new Error('AI provider returned an empty review');
      return { ...result, skills:Array.isArray(result.skills)?result.skills:fallbackSkills, roadmap:Array.isArray(result.roadmap)&&result.roadmap.length?result.roadmap:makeRoadmap(fallbackSkills,role), provider:`${isGemini?'Gemini':'OpenAI'} AI analysis · ${usedModel}` };
    }catch(error){aiFailure=error.message;console.error('AI resume review unavailable; using built-in analysis:',aiFailure)}
  }
  return {summary:`Resume reviewed for ${role}. Found ${text.trim().split(/\s+/).length} words and ${fallbackSkills.length} relevant skills.`,skills:fallbackSkills.slice(0,8),strengths:[/project/i.test(text)?'Project experience is included.':'Add a projects section with tools and outcomes.'],improvements:[/summary|objective/i.test(text)?'Tailor your opening summary to the target role.':'Add a short summary focused on your target role.','Add measurable outcomes to project and experience bullets.','Align keywords with the job description and only list skills you can explain.'],roadmap:makeRoadmap(fallbackSkills,role),provider:`Built-in fallback · ${aiFailure}`};
}

async function generateChatReply(message,workspace){
  const provider=(process.env.AI_PROVIDER||'openai').toLowerCase();
  const isGemini=provider==='gemini';
  const key=isGemini?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY;
  if(!key)throw new Error(`Set ${isGemini?'GEMINI_API_KEY':'OPENAI_API_KEY'} in the root .env file to enable the AI chat.`);
  if(!['openai','gemini'].includes(provider))throw new Error('AI_PROVIDER must be "openai" or "gemini".');
  const models=isGemini?[...new Set([process.env.GEMINI_MODEL||'gemini-3.8-flash',process.env.GEMINI_FALLBACK_MODEL||'gemini-3.1-flash-lite'])]:[process.env.OPENAI_MODEL||'gpt-4o-mini'];
  const endpoint=isGemini?'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions':'https://api.openai.com/v1/chat/completions';
  const role=workspace.profile?.targetRole||workspace.role||'developer';
  const skills=(workspace.profile?.skills||[]).slice(0,30).join(', ')||'not added yet';
  let lastError='AI provider did not return a response.';
  for(const model of models){
    for(let attempt=0;attempt<3;attempt++){
      let response,data;
      try{response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:`You are Orbit, a concise and supportive career coach. Help with learning plans, resumes, job skills, and interview practice. The user's target role is ${role}; their current skills are ${skills}. Give practical, specific advice. Do not claim to have read a resume unless its text is provided.`},{role:'user',content:message}],temperature:0.5}),signal:AbortSignal.timeout(isGemini?45000:30000)})}
      catch(error){lastError=`Could not reach ${isGemini?'Gemini':'OpenAI'} (${error.name}). Check the server's outbound internet connection.`;if(error.name==='TimeoutError')break;if(attempt<2){await new Promise(resolve=>setTimeout(resolve,700*(2**attempt)));continue}break}
      data=await response.json().catch(()=>({}));
      if(response.ok){const reply=data.choices?.[0]?.message?.content;if(reply)return reply;lastError='AI provider returned an empty reply.';break}
      lastError=`${isGemini?'Gemini':'OpenAI'} returned HTTP ${response.status}${data.error?.code?` (${data.error.code})`:''}.`;
      if(isGemini&&response.status===503&&attempt<2){await new Promise(resolve=>setTimeout(resolve,800*(2**attempt)+Math.random()*300));continue}
      if(isGemini&&response.status===503&&model!==models.at(-1))break;
      throw new Error(lastError);
    }
    if(!isGemini||model===models.at(-1))break;
  }
  throw new Error(lastError);
}

app.get('/api/health',(req,res)=>res.json({ok:true,database:mongoose.connection.readyState===1?'connected':'disconnected'}));
app.post('/api/chat',auth,async(req,res)=>{
  try{const message=String(req.body?.message||'').trim();if(!message)return res.status(400).json({error:'Enter a message first.'});if(message.length>2000)return res.status(400).json({error:'Keep messages under 2,000 characters.'});const user=await User.findById(req.user.id);if(!user)return res.status(404).json({error:'Account not found.'});const reply=await generateChatReply(message,user.workspace||{});res.json({reply})}catch(error){console.error('AI chat unavailable:',error.message);res.status(503).json({error:error.message||'AI chat is unavailable right now.'})}
});
app.post('/api/auth/signup',async(req,res)=>{
  try{
    const {name,password}=req.body||{};
    const email=String(req.body?.email||'').trim().toLowerCase();
    const normalizedName=String(name||'').trim();
    const normalizedPassword=String(password||'');
    if(!normalizedName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||normalizedPassword.length<8)return res.status(400).json({error:'Enter your name, a valid email, and a password with at least 8 characters.'});
    if(await User.exists({email}))return res.status(409).json({error:'An account already exists for this email.'});
    const passwordHash=await bcrypt.hash(normalizedPassword,12);
    const workspace=structuredClone(seedWorkspace);
    workspace.profile={...workspace.profile,name:normalizedName,email,github:'',linkedin:'',leetcode:'',githubUrl:'',linkedinUrl:'',leetcodeUrl:'',websiteUrl:'',skills:[]};
    workspace.projects=[];workspace.certifications=[];workspace.completed=[];workspace.activities=[];workspace.public=false;workspace.analysis=null;workspace.roadmap=null;workspace.resume=null;
    const user=await User.create({name:normalizedName,email,passwordHash,workspace});
    res.status(201).json(publicUser(user));
  }catch(error){
    if(error.code===11000)return res.status(409).json({error:'An account already exists for this email.'});
    console.error('Account creation failed:',error.message);
    res.status(500).json({error:'Could not create your account.'});
  }
});
app.post('/api/auth/login',async(req,res)=>{
  try{
    const email=String(req.body?.email||'').trim().toLowerCase();
    const password=String(req.body?.password||'');
    const user=await User.findOne({email});
    if(!user){console.warn('Sign in rejected: no account matched the submitted email.');return res.status(401).json({error:'Email or password is incorrect.'});}
    if(!await bcrypt.compare(password,user.passwordHash)){console.warn('Sign in rejected: password did not match the account hash.');return res.status(401).json({error:'Email or password is incorrect.'});}
    await clearSeedDeveloperLinks(user);
    res.json(publicUser(user));
  }catch(error){
    console.error('Sign in failed:',error.message);
    res.status(500).json({error:'Could not sign in.'});
  }
});app.get('/api/workspace',auth,async(req,res)=>{const user=await User.findById(req.user.id);if(!user)return res.status(404).json({error:'Account not found.'});await clearSeedDeveloperLinks(user);res.json({name:user.name,email:user.email,workspace:user.workspace})});
app.put('/api/workspace',auth,async(req,res)=>{if(!req.body||typeof req.body!=='object')return res.status(400).json({error:'Workspace data is invalid.'});const workspace={...req.body};delete workspace.profile?.password;const user=await User.findByIdAndUpdate(req.user.id,{$set:{workspace}},{new:true});if(!user)return res.status(404).json({error:'Account not found.'});res.json({ok:true})});
app.post('/api/resume/analyze',auth,(req,res,next)=>upload.single('resume')(req,res,e=>e?res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'Resume must be 10 MB or smaller.':'Choose a PDF, DOCX, or TXT resume.'}):next()),async(req,res)=>{
  try{if(!req.file)return res.status(400).json({error:'Choose a resume file.'});let text='';if(req.file.mimetype==='application/pdf'||req.file.originalname.toLowerCase().endsWith('.pdf'))text=(await pdf(fs.readFileSync(req.file.path))).text;else if(req.file.originalname.toLowerCase().endsWith('.docx'))text=(await mammoth.extractRawText({path:req.file.path})).value;else text=fs.readFileSync(req.file.path,'utf8');if(!text.trim())return res.status(422).json({error:'No readable text found. Image-only PDFs need OCR before upload.'});const user=await User.findById(req.user.id);const previousResume=user.workspace.resume;const role=req.body.role||user.workspace.profile?.targetRole||user.workspace.role||'MERN Stack Developer';const skills=user.workspace.profile?.skills||[];const analysis=await aiReview(text,role,skills);const roadmap=analysis.roadmap?.length?analysis.roadmap:makeRoadmap(analysis.skills,role);const resume={id:path.basename(req.file.filename),name:req.file.originalname,size:req.file.size,mimeType:req.file.mimetype,uploadedAt:new Date().toISOString()};user.workspace.resume=resume;user.workspace.analysis=analysis;user.workspace.roadmap=roadmap;user.workspace.role=role;user.workspace.profile.targetRole=role;user.workspace.profile.skills=[...new Set([...skills,...analysis.skills])];user.markModified('workspace');await user.save();if(previousResume?.id&&previousResume.id!==resume.id)fs.promises.unlink(path.join(uploadDir,path.basename(previousResume.id))).catch(()=>{});res.json({resume,analysis,roadmap,workspace:user.workspace})}catch(e){res.status(500).json({error:e.message||'Resume analysis failed.'})}
});
app.get('/api/resume/:id',auth,async(req,res)=>{const safe=path.basename(req.params.id);const file=path.join(uploadDir,safe);if(!fs.existsSync(file))return res.status(404).json({error:'Resume file not found.'});const user=await User.findById(req.user.id);if(user?.workspace.resume?.id!==safe)return res.status(403).json({error:'Access denied.'});res.type(user.workspace.resume.mimeType||'application/octet-stream');res.setHeader('Content-Disposition',`inline; filename="${user.workspace.resume.name.replace(/[\r\n"]/g,'') }"`);fs.createReadStream(file).pipe(res)});
app.delete('/api/resume/:id',auth,async(req,res)=>{try{const safe=path.basename(req.params.id);const user=await User.findById(req.user.id);if(!user)return res.status(404).json({error:'Account not found.'});if(user.workspace.resume?.id!==safe)return res.status(404).json({error:'Resume file not found.'});user.workspace.resume=null;user.workspace.analysis=null;user.workspace.roadmap=null;user.workspace.completed=[];user.markModified('workspace');await user.save();await fs.promises.unlink(path.join(uploadDir,safe)).catch(()=>{});res.json({ok:true,workspace:user.workspace})}catch(e){res.status(500).json({error:'Could not remove the saved resume.'})}});

async function start(){if(!JWT_SECRET){console.error('JWT_SECRET is required. Copy .env.example to .env and set a secret.');process.exit(1)}if(!process.env.MONGODB_URI){console.error('MONGODB_URI is required. Configure MongoDB Atlas in .env.');process.exit(1)}await mongoose.connect(process.env.MONGODB_URI);const demoEmail='alex.kim@example.com';if(!await User.exists({email:demoEmail})){const passwordHash=await bcrypt.hash('Demo123!',12);await User.create({name:'Alex Kim',email:demoEmail,passwordHash,workspace:structuredClone(seedWorkspace)});console.log('Created demo login: alex.kim@example.com / Demo123!')}app.listen(PORT,()=>console.log(`DevOrbit 360 running at http://localhost:${PORT}`))}
start().catch(error=>{console.error('Server startup failed:',error.message);process.exit(1)});
