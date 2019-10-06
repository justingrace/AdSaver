const nodemailer = require('nodemailer');
const {nodemailer: {email, password}} = require('./config/keys');

let transporter = nodemailer.createTransport({
    service: 'Godaddy',
    host: "smtpout.secureserver.net",
    secure: true,
    port: 465,
    auth: {
        user: email,
        pass: password
    }

})

const mailOptions = (to, subject, body) => {
    return {
        from: `'AdSaver' <${email}>`,
        to, // list of receivers
        subject, // Subject line
        html: body
    }

};

const sendMail = (to, subject, body) => {
    transporter.sendMail(mailOptions(to, subject, body), function (err) {
        if(err)
            console.log("Mailing error:", err)
    });
}

module.exports = {
    sendMail
}
