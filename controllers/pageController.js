import User from "../models/userModel.js";
import ContactModel from '../models/messagModel.js'; // modeli  import ettik 


const getIndexPage = (req, res) => {
  res.render('index', {
    link: 'index',
  });
};

const getShopPage = (req, res) => {
  res.render('shop', {
    link: 'shop',
  });
};

const getAboutPage = (req, res) => {
  res.render('about', {
    link: 'about',
  });
};

const getReviewPage = (req, res) => {
  res.render('review', {
    link: 'review',
  });
}

const getBlogPage = (req, res) => {
  res.render('blog', {
    link: 'blog',
  });
}

const getContactPage = (req, res) => {
  res.render('contact', {
    link: 'contact',
    result: '',
  });
}

const getRegisterPage = (req, res) => {
  res.render('Register', {
    link: 'Register',
  });
};



const createNewUser = async (req, res) => {
  const { username, email, password } = req.body;

  /// is  there  any  user with the given  email ////
  const existingUser = await User.findOne({ email: email }).exec();

  if (existingUser) {
    return res.render('index', {
      link: 'index',
      error: "Username already exists"
    });
  }


  const user = new User({
    username: username,
    email: email,
    password: password,
  });

  await user.save(); /// boylece  biz veri tabaninda kaydetmis  olduk 

  console.log(user);

  res.render('Register', {
    link: 'Register',
  });

};


const logoutUser = (req, res) => {
  req.session.destroy();
  res.redirect('/');
};

const loginUser = async (req, res) => {

  const { email, password } = req.body;

  const user = await User.findOne({
    password: password,
    email: email
  }).exec();

  console.log(user);

  if (!user) {
    return res.render('index', {
      link: 'index',
      error: "Invalid username or password"
    });
  }

  req.session.username = user.username;
  res.locals.username = user.username;

  res.render('index', {
    link: 'index',
  });
}

//// قسم  التواصل الجديد 
const proccessContactForm = (req, res) => {
  const { name, email, number, subject, message } = req.body;

  // إنشاء مستند جديد في قاعدة البيانات
  const newContact = new ContactModel({
    name,
    email,
    number,
    subject,
    message
  });

  // حفظ البيانات في قاعدة البيانات
  newContact.save()
    .then(() => {
      const result = "We Received your message";
      res.render('contact', {
        link: 'contact',
        result: result,
      });
    })
    .catch(err => {
      const result = "There was an error saving your message";
      res.render('contact', {
        link: 'contact',
        result: result,
      });
    });
};

export { logoutUser, loginUser, getIndexPage, getShopPage, getAboutPage, getReviewPage, getRegisterPage, createNewUser, getBlogPage, getContactPage, proccessContactForm }; // export ettik