require('dotenv').config()
const express = require('express')
const authRoutes = require('./routes/auth');
const scrapeRoutes = require('./routes/scraper');
const passportSetup = require('./config/passport');
const cookieSession = require('cookie-session');
const passport = require('passport')
const keys = require('./config/keys');
const app = express();
const path = require('path')

app.use(express.urlencoded({extended: true}));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use(cookieSession({
	maxAge: 7* 24 * 60 * 60 * 1000,
	keys: [keys.session.cookieKey]
}));


app.use(passport.initialize());
app.use(passport.session());

const authCheck = (req, res, next) => {
	if(!req.user) res.redirect('/auth/login')
	else next();
}

app.use('/auth', authRoutes);
app.use('/privacy', (req, res) => res.render('privacy'));
app.use('/', authCheck, scrapeRoutes);

app.listen(process.env.PORT || 3000, () => {
	console.log('app running')
})
