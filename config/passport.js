const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20');
const keys = require('./keys');

passport.serializeUser((user, done) => {
    let sessionUser = {
        email: user.email,
        _id: user.googleID,
        accessToken: user.accessToken,
        refreshToken: user.refreshToken,
        expiry: user.expiry
    }

    done(null, sessionUser)
})

passport.deserializeUser((sessionUser, done) => {
    done(null, sessionUser) // now can access request.user
})

passport.use(new GoogleStrategy({
    callbackURL: '/auth/google/redirect',
    clientID: keys.google.clientID,
    clientSecret: keys.google.clientSecret
}, (accessToken, refreshToken, profile, done) => {
    console.log(accessToken, "accessToken")
    console.log(refreshToken, "refreshToken")
    console.log(profile, "profile")
    user = {
        "email": profile._json.email,
        "accessToken": accessToken,
        "refreshToken": refreshToken,
        'googleID': profile.id,
        'expiry': new Date().getTime() + 3600000
    }
    done(null, user)
})
)
