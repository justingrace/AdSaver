const router = require('express').Router();
const {google} = require('googleapis')
const puppeteer = require('puppeteer');
const axios = require('axios');
const {Parser} = require('json2csv')
const {sendMail} = require('../emailer');
const keys = require('../config/keys')
const {getVideoDurationInSeconds} = require("get-video-duration");
const {default:fullPageScreenshot} = require("puppeteer-full-page-screenshot");
const Jimp = require("jimp");

let error = null;
let errorCode = null;
let errors = "";


router.get('/', (req, res) => {
    res.render('adsearch', {error})
})


router.post('/', async (req, res) => {
    let start_time = new Date();
    req.connection.setTimeout(15 * 60 * 1000); // ten minutes
    // 1. receive url from User
    const url = req.body.url;
    const toEmail = req.body.email;
    let drive;
    if (url.length <= 0 || toEmail.length <= 0) {
        error = "Please enter URL and email to notify";
        errorCode = 2;
    } else {
        // 2. Drive init
        const oauth2Client = new google.auth.OAuth2({
            clientId: keys.google.clientID,
            clientSecret: keys.google.clientSecret
        })

        if (req.user === undefined) {
            error = "Error :You need to login!";
            errorCode = 1;
        } else {
            // if ((new Date().getTime()) > req.user.expiry - 300000) {
            //     console.log("setting a_t and r_t")
            //     req.user.expiry = Date.now() + 3600000;
            //     oauth2Client.setCredentials({
            //         'access_token': req.user.accessToken,
            //         'refresh_token': req.user.refreshToken
            //     });
            // } else {
            //     console.log("setting a_t")
            //     oauth2Client.setCredentials({
            //         'access_token': req.user.accessToken,
            //     });
            // }
            oauth2Client.setCredentials({
                'access_token': req.user.accessToken,
                'refresh_token': req.user.refreshToken
            });

            drive = google.drive({
                version: 'v3',
                auth: oauth2Client
            });



            await drive.files.list({q: "name='1'"})
                .catch(e => {
                    console.log("Google Drive Error", e)
                    error = "Google Drive Error :You need to login!";
                    errorCode = 1;
                })
        }
    }

    // 3. Helper methods
    const autoScroll = async page => {
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = window.innerHeight;
                var timer = setInterval(() => {
                    var scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 2000);
            });
        });
    }
    const createFolder = async (name, parents) => {
        return new Promise(resolve => {
            let folderMetadata = {
                'name': name,
                parents: parents,
                'mimeType': 'application/vnd.google-apps.folder'
            };
            drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            })
                .then(file => resolve({ok: true, folderId: file.data.id}))
                .catch(err => resolve({ok: false, err}));
        })
    }
    const uploadImageFile = async (name, parents, img) => {
        return new Promise((resolve) => {

            let fileMetadata = {
                'name': name,
                parents: parents
            };

            let stream = require('stream');
            let bufferStream = new stream.PassThrough();
            bufferStream.end(img);

            let media = {
                mimeType: 'image/jpeg',
                body: bufferStream
            };

            drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            })
                .then(file => resolve({ok: true, fileId: file.data.id}))
                .catch(err => resolve({ok: false, err}))
        })
    }
    const uploadCSVFile = async (name, parents, csv) => {
        return new Promise((resolve) => {
            let fileMetadata = {
                'name': name,
                'mimeType': 'application/vnd.google-apps.spreadsheet',
                parents: parents
            };

            let media = {
                mimeType: 'text/csv',
                body: csv
            };

            drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            })
                .then(file => resolve({ok: true, fileId: file.data.id}))
                .catch(err => resolve({ok: false, err}));
        })
    }
    const uploadVideoFile = async (name, parents, vid) => {
        return new Promise((resolve) => {
            let fileMetadata = {
                'name': name,
                parents: parents
            };

            let media = {
                mimeType: 'video/mp4',
                body: vid
            };

            drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            })
                .then(file => resolve({ok: true, fileId: file.data.id}))
                .catch(err => resolve({ok: false, err}));
        });

    }
    const download = async url => {
        return new Promise((resolve) => {
            axios.get(url, {responseType: 'stream'})
                .then(res => resolve({ok: true, vid: res.data}))
                .catch(err => resolve({ok: false, err}))
        })
    }
    const getTimeTaken = (now, start) => {
        let diff = now - start;
        let mins = Math.floor(diff / 1000 / 60);
        diff -= mins * 1000 * 60;
        let secs = Math.floor(diff / 1000);
        return {mins, secs};
    }
    const sendResponseEmail = (page_name, mainFolderId) => {
        let {mins, secs} = getTimeTaken(Date.now(), start_time.getTime());
        // console.log(`${mins}m ${secs}s`);
        let drive_url = `https://drive.google.com/drive/folders/${mainFolderId}`
        let body = "", subject = "";
        if (error !== null) {
            subject = `[${page_name}] : Error!`
            body = `
                <p>There seems to have been an error in the processing of ads. Here is the error message:</p><br>
                <p>${error}</p>
                <p>This task took ${mins}m ${secs}s</p>
        `
        } else {
            subject = `[${page_name}] Your ads are saved!`;
            body = `
                <p>Check your drive: <a href="${drive_url}"></a>${drive_url}!</p><br>
                <p>This task took ${mins}m ${secs}s</p><br><br>
               `;
            if (errors !== "")
                body += `Some minor errors related to images/videos in the ads being inaccessible: <br>
                         ${errors}`;
        }

        error = null;
        errorCode = null;
        errors = "";
        sendMail(req.body.email, subject, body)
    }
    const genDateStamp = () => {
        let d = new Date();
        return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
    }


    // 4. Extract data via Puppeteer
    if (error === null) {
        res.send("Done! You will receive an email")
        const browser = await puppeteer.launch({args: ['--lang=en-US', '--no-sandbox']});
        const page = await browser.newPage();
        await page.setViewport({width: 1920, height: 1080})
        await page.goto(url);
        await page.waitFor(60000);
        await autoScroll(page);
        await page.evaluate(() => window.scrollTo(0, 0))

        const AD_SELECTOR = "._99s5 > *";
        let page_name, ads, data;
        try {
            data = await page.$$eval(AD_SELECTOR, ads => {
                let headline = "", description = "", primary_text = "", id, buttonEl, primaryTextEl, button = "", link="",
                    has_carousel;

                const PAGE_NAME_SELECTOR = "._8wh_";
                const PRIMARY_TEXT_SELECTOR = "._7jyr";
                const INFO_SELECTOR = "._8jgz._8jg_";

                return JSON.stringify(
                    {
                        page_name: document.querySelector(PAGE_NAME_SELECTOR) != null ? document.querySelector(PAGE_NAME_SELECTOR).innerText : "",
                        ads: ads.reduce((obj, ad) => {
                            primaryTextEl = ad.querySelector(PRIMARY_TEXT_SELECTOR);
                            primary_text = primaryTextEl != null ? primaryTextEl.innerText : "";
                            link = ad.querySelector("._231w._231z._4yee")!==null ? ad.querySelector("._231w._231z._4yee").href : "";
                            buttonEl = ad.querySelectorAll("button");
                            buttonEl = buttonEl[buttonEl.length-1]
                            button = buttonEl != null ? buttonEl.innerText : "";

                            let infoBox = ad.querySelector(INFO_SELECTOR);
                            if (infoBox != null) {
                                has_carousel = ad.querySelector("div[direction='forward']") != null;

                                // headline="";
                                // if(has_carousel){
                                //     let carousel_index = 1;
                                //     for(let i=2;i<elements.length; i+=5){
                                //         headline+=`${carousel_index}) ${elements[i].innerText} \n`
                                //         description+= `${carousel_index}) ${elements[i+1].innerText} \n`
                                //         carousel_index++;
                                //     }
                                // }
                                // else{

                                let i = infoBox.firstElementChild.firstElementChild
                                headline = (i != null) ? infoBox.firstElementChild.firstElementChild.innerText : "";
                                description = (infoBox.firstElementChild.children != null) ? Array.from(infoBox.firstElementChild.children).slice(1).map(el => el.innerText).join("\n") : ""
                                // }
                            }

                            let vid = ad.querySelector("video")
                            let vid_url = vid != null ? vid.src : null;

                            id = (vid != null ? vid_url : "") + primary_text + headline + description;

                            const {x, y, width, height} = ad.getBoundingClientRect();
                            obj[id] = {
                                left: x,
                                top: y,
                                width,
                                height,
                                vid_url,
                                primary_text,
                                headline,
                                description,
                                button,
                                link
                            };
                            return obj;

                        }, {})
                    }
                )
            });

            ads = JSON.parse(data).ads;
            page_name = JSON.parse(data).page_name;
            // console.log("received ads", ads);
            // res.json(ads)
        } catch (e) {
            error = e.message;
            errorCode = 2;
            console.log("Error encountered in processing: ", e);
        }

        // 4. Create Drive folders
        let pageNameId = null, parentFolderId = null, screenshotsFolderId, fullPageScreenshotsFolderId, t1VideosFolderId, t2VideosFolderId;
        if (error === null) {

            let {data: {files: [{id: adLibraryId}]}} = await drive.files.list({q: `name = 'Ad Library'`});

            let {data: {files}} = await drive.files.list({q: `name = "${page_name}" and parents="${adLibraryId}"`});

            if (files.length === 0) {
                let {folderId} = await createFolder(page_name, [adLibraryId]);
                parentFolderId = folderId;
            } else parentFolderId = files[0].id;

            let {folderId: pnID} = await createFolder(`${genDateStamp()} ${page_name}`, [parentFolderId]);
            pageNameId = pnID;

            let {folderId} = await createFolder("screenshots", [pageNameId]);
            screenshotsFolderId = folderId;

            let {folderId: fps} = await createFolder("fullPageScreenshots", [screenshotsFolderId]);
            fullPageScreenshotsFolderId = fps;

            let {folderId: t1} = await createFolder("T1 videos", [pageNameId]);
            t1VideosFolderId = t1
            let {folderId: t2} = await createFolder("T2 videos", [pageNameId]);
            t2VideosFolderId = t2

            // 5. For each ad, generate screenshots and videos appropriately
            const PADDING = 0;
            let vid_index = 1;
            let img_index = 1;
            let ad_index = 1;
            let videos_saved = {};
            let ad_copy_json = [];

            let links = {};
            if (ads) {
                for (const id of Object.keys(ads)) {
                    let ad = ads[id]
                    if(ad.link) links[ad.link]=ad.link;
                    const img = await page.screenshot({
                        clip: {
                            x: ad.left - PADDING,
                            y: ad.top - PADDING,
                            width: ad.width + PADDING * 2,
                            height: ad.height + PADDING * 2
                        }
                    });

                    let {ok, err, fileId: imgFileId} = await uploadImageFile(`${img_index}.jpg`, [screenshotsFolderId], img)
                    if (ok) {
                        img_index++;
                    } else {
                        errors += "Error downloading image \n" + err + "\n";
                    }

                    if (ad.vid_url != null) {
                        if (!videos_saved[ad.vid_url]) {
                            let {ok, err, vid} = await download(ad.vid_url)
                            if (ok) {
                                let vid_duration = await getVideoDurationInSeconds(ad.vid_url) || 0;
                                const {ok: ok_vid_upload, err, fileId: vidFileId} = await uploadVideoFile(`${vid_index}.mp4`, [vid_duration > 20 ? t1VideosFolderId : t2VideosFolderId], vid)
                                if (!ok_vid_upload) {
                                    errors += "Error uploading video \n" + err + "\n";
                                }
                                videos_saved[ad.vid_url] = 1;
                                vid_index++;

                            } else {
                                errors += "Error downloading video \n" + err + "\n";
                            }
                        }
                    }

                    ad_copy_json.push({
                        "S. No.": ad_index,
                        "Primary Text": ad.primary_text,
                        "Headline": ad.headline,
                        "Description": ad.description,
                        "Video URL": ad.vid_url != null ? ad.vid_url : "",
                        "Button Text": ad.button,
                        "Page URL": ad.link != null ? ad.link : ""
                    });
                    ad_index++;
                }

                let linkKeys= Object.keys(links), urlLink;
                for(let i=0; i<linkKeys.length; i++){
                    urlLink = linkKeys[i];
                    await page.goto(linkKeys[i]);
                    await page.waitFor(10000);
                    // img = await page.screenshot({ fullPage: true })
                    const scr = await fullPageScreenshot(page);
                    scr.getBuffer(Jimp.MIME_PNG, async (error, img) => {
                        let {ok, err, fileId: imgFileId} = await uploadImageFile(`${urlLink.slice(0, urlLink.indexOf(".com")+4)}.jpg`, [fullPageScreenshotsFolderId], img)
                        if (!ok){
                            errors += "Error downloading image \n" + err + "\n";
                        }
                    })
                }

                let fields = ["S. No.", "Primary Text", "Headline", "Description", "Video URL", "Button Text", "Page URL"];
                const json2csvParser = new Parser({fields});
                const csv = json2csvParser.parse(ad_copy_json);
                const {ok, err, fileId: csvId} = await uploadCSVFile(`Ad Copy - ${page_name}`, [pageNameId], csv);
                if (!ok) errors += "Error producing Google Sheet \n" + err + "\n";
            }
        } else {
            console.log("error!")
            errorCode = 2;
            error = "Unexpected error. No ads found.";
        }

        console.log("Final errors", errors)
        sendResponseEmail(page_name, pageNameId);
        browser.close();
    } else {
        res.render(((errorCode === 1) ? 'login' : 'adsearch'), {error});
        error = null;
        errorCode = null;
    }


})

module.exports = router
