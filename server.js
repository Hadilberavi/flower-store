import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import pageRoute from './routs/pageRoute.js';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';


dotenv.config();  // dotenv'i başlatıyoruz

// connection to the DB
// Veritabanı bağlantısını başlatıyoruz

const app = express();
const PORT = process.env.PORT;  // PORT çevre değişkeninden alınacak

// ejs template engine
app.set('view engine', 'ejs');


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  store: MongoStore.create({   /// session mongo  saklanmasi
    mongoUrl: process.env.SESSION_DB_URL,
  })
}));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // post  request  aracigiyla gelen bilgileri expressi  anlmasini  icin su  satiri eklememiz  gerekir   


// bu  kisim middlware bir  degiskenin tum sayfalarda  gozukmesi icin kullaniliyor 
app.use((req, res, next) => { 
  res.locals.username = req.session.username;
  next();
});

//routes
app.use('/', pageRoute);



mongoose
  .connect(process.env.DB_URI, {
    dbName: 'staj2',
  })
  .then(() => {
    console.log('Connected to the DB successfully');
    app.listen(PORT, () => {
      console.log(`Example app listening on port ${PORT}`);  // Uygulama başlatıldı mesajı
    });
  })
  .catch((err) => {
    console.log(`DB connection error: ${err}`);
  });



