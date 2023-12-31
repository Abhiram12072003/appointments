const express = require('express')
const createError = require('http-errors')
// const morgan = require('morgan')
const cors = require('cors')
const cookieParser=require('cookie-parser');
require('dotenv').config()
const stytch = require('stytch');
const e = require('express');

const client = new stytch.Client({
  project_id: process.env.PROJECT_ID,
  secret: process.env.PROJECT_SECRET,
  env: stytch.envs.test,
})

const mclient=require('mongodb').MongoClient;

// cnct();
const app = express()
app.use(express.json())
// app.use(express.urlencoded({ extended: false }))
// app.use(morgan('dev'))
app.use(cookieParser(process.env.COOKIE_SECRET))
app.use(
  cors({
    origin: 'http://localhost:3000',
    methods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  })
)


app.get('/', async (req, res, next) => {
  res.send({ message: 'Awesome it works ' })
})

app.post('/send-email', async (req, res, next) => {
  try {
    const { email } = req.body
    const params = { email }
    const response = await client.otps.email.loginOrCreate(params)
    res.json(response)
  } catch (error) {
    next(error)
  }
})

app.post('/verify-otp', async (req, res, next) => {
  try {
    const { method_id, code } = req.body
    console.log(method_id, code);
    const response = await client.otps.authenticate({
      method_id,
      code,
      session_duration_minutes:15*24*60
    })
    console.log(response)
    const { session_token, user_id } = response
    res.cookie('x-stytch-token', session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      signed: true,
      maxAge: 15 * 24 * 60 * 60 * 1000,
    })
    res.json({ user_id })
  } catch (error) {
    next(error)
  }
})

app.post('/add-event',verifyToken,async(req,res,next)=>{
    try{
        const params = {
            user_id: req.user_id,
          };
        const { date,id } = req.body;
        console.log(date,id);
        const user = await client.users.get(params);
        const email = user.emails[0].email;   
        const eventsCollection=await req.app.get('eventsCollection');
        const query={date:date,slot:id};
        const data=await eventsCollection.findOne(query);
        if(data==null){
            const doc={date:date,slot:id,email:email};
            await eventsCollection.insertOne(doc);
            res.json("Slot booked Successfully");
        }
        else{
          console.log(data);
          res.json("Slot is not booked already someone has booked");
        }
    }
    catch(err){
        next(err);
    }
})



app.get('/show-slots',verifyToken,async(req,res,next)=>{
  try{
    const params ={
      user_id:req.user_id
    }
    const user=await client.users.get(params);
    const email=user.emails[0].email;
    const eventsCollection= await req.app.get('eventsCollection');
    const query={email:email};
    const sort= {date:1,slot:1};
    const data=eventsCollection.find(query).sort(sort);
    let arr=[]
    for await (const doc of data){
      let user={date:doc.date,slot:doc.slot};
      arr.push(user)
    }
    res.json(arr);
  }
  catch(err){
    next(err);
  }
})

app.post('/delete-slot',async()=>await cnct(),verifyToken,async (req,res,next)=>{
  try{
    const {date,slot } =req.body;
    const doc={date:date,slot:slot};
    console.log(date,slot);
    const eventsCollection=await req.app.get("eventsCollection");
    const deletedCount=await eventsCollection.deleteOne(doc);
    if(deletedCount.deletedCount==1){
      res.json("Deleted Successfully");
    }
    else{
      console.log(deletedCount);
      res.json("Not deleted");
    }
  }
  catch(err){
    next(err);
  }
})

app.get('/profile', verifyToken, async (req, res, next) => {
  try {
    console.log("usef",req.user_id);
    const params = {
        user_id: req.user_id,
      };
    const user = await client.users.get(params)
    console.log("useer",user);
    const email=user.emails[0].email;
    console.log("email",email);
    res.json(user)
  } catch (error) {
    next(error)
  }
})

app.delete('/logout', async (req, res, next) => {
  try {
    const session_token = req.signedCookies['x-stytch-token']
    const params = {
        session_token: session_token,
    };
    const response = await client.sessions.revoke(params)
    res.clearCookie('x-stytch-token', {})
    res.sendStatus(204)
  } catch (error) {
    next(error)
  }
})


async function verifyToken(req, res, next) {
  try {
    const session_token = req.signedCookies['x-stytch-token']
    console.log("ses",session_token)
    const response = await client.sessions.authenticate({
      session_token: session_token,
    })
    req.user_id = response.session.user_id
    next()
  } catch (error) {
    next(new createError.Unauthorized())
  }
}

app.use((req, res, next) => {
  next(new createError.NotFound())
})

app.use((err, req, res, next) => {
  res.status(err.status || 500)
  res.send({
    status: err.status || 500,
    message: err.message,
  })
})

const invalidpathMiddleware=(request,response,next)=>{
    response.send({message:'Invalid path'});
}
app.use("*",invalidpathMiddleware);

const PORT = process.env.PORT || 3000
mclient.connect('mongodb+srv://abhiram:6309422@cluster0.zgy92ci.mongodb.net/?retryWrites=true&w=majority')
    .then((dbRef)=>{
        //connect to a database
        const dbObj=dbRef.db('Users');
        // Connect to collections of database
        const eventsCollection=dbObj.collection('eventsCollection');
        // Shre collection to API's
        app.set('eventsCollection',eventsCollection);
        // app.set('productCollectionObj',productCollectionObj);
        console.log('DB connection success')
    })
    .catch(err=>console.log("database connect error:",err));
app.listen(PORT, () => console.log(`http://localhost:${PORT}`))