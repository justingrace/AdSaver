const router = require('express').Router();
const passport = require('passport')
// login

router.get('/login', (req, res) => {
	res.render('login', {error:null})
})

router.get('/logout', (req, res) => {
	res.send('logging out')
})

router.get('/google', passport.authenticate("google", {
	scope: ["profile", "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive.metadata", "https://www.googleapis.com/auth/drive.appdata", "email"],
	accessType: 'offline',
	approvalPrompt: 'force'
}))

router.get('/google/redirect', passport.authenticate('google') , (req, res) => {
	res.render('adsearch', {error: null})
})

module.exports = router;
