import mongoose from 'mongoose';
const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    number: String,
    subject: String,
    message: String,
    date: { type: Date, default: Date.now }
  });
  
  const Contact = mongoose.model('Contact', contactSchema); // ilk  once  bir  model  olustuurup  mongo da kaydettik  
  
  
export default Contact;    ////  sonra  bu  modeli baska  bir dosyada kullanmak icin export  yaptik   

 //when  you  make  a  model  or  function and you have to use  it  in  another file  you  will  make export to this  model  and  the  make  import in  another file to use  this  model 



