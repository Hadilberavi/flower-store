import express from 'express';
import * as pageController from '../controllers/pageController.js';
const router = express.Router();

// Pages
router.route('/').get(pageController.getIndexPage);
router.route('/shop').get(pageController.getShopPage);
router.route('/about').get(pageController.getAboutPage);
router.route('/review').get(pageController.getReviewPage);
router.route('/blog').get(pageController.getBlogPage);

router.route('/contact').get(pageController.getContactPage);
router.route('/contact').post(pageController.proccessContactForm);


// Authentication
router.route('/Register').get(pageController.getRegisterPage);
router.route('/Register').post(pageController.createNewUser);
router.route('/login').post(pageController.loginUser);
router.route('/logout').post(pageController.logoutUser);

export default router;