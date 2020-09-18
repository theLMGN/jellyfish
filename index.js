
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require("fs")
const path = require("path")
const homedir = require('os').homedir();
const child_process = require('child_process')
const fetch = require("node-fetch")
const url = require('url');


const JELLYFISH_DATA_DIR = path.join(homedir,"Documents","Jellyfish")
global.JELLYFISH_DATA_DIR = JELLYFISH_DATA_DIR

var supportedExploits = [
    "null",
]
if (process.platform == "win32") {
    supportedExploits.push("synx","sirhurt","wrd")
}
if (process.platform == "darwin") {
    supportedExploits.push("calamari","fluxus")
}
var udr = app.getPath('userData')
if (!fs.existsSync(udr)) {fs.mkdirSync(udr)}
function getPreferedExploit() {
    try {
        if (fs.existsSync(path.join(udr,"preferedExploit.txt"))) {
            var fc = fs.readFileSync(path.join(udr,"preferedExploit.txt"))
            if (supportedExploits.includes(fc.toString())) {
                return fc.toString()
            } else {
                return "null"
            }
        } else {
            return "null"
        }
    } catch(e) {
        return "null"
    }
}

async function createWindow () {
    global.exploitName = (getPreferedExploit())
    global.exploit = require("./exploits/" + exploitName)
    if (false && dialog.showMessageBoxSync({
        buttons: ["No","Yes"],
        defaultId: 1,
        message: "PLEASE READ",
        detail: "Jellyfish is only to be used on games that you have explicit permission to run a LSI on.\n\nAre you intending to use Jellyfish to inject into games you are not the owner of, or do not have permission from the owner to run a LSI on?",
    }) == 1) {
        return process.exit()
    }
    
    // Create the browser window.
    const win = new BrowserWindow({
        width: 768,
        height: 585,
        show:true,
        webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
    })
    win.loadFile('preloader.html')
    win.removeMenu()
    global.win = win
    win.setTitle("Jellyfish | Creating required files")
    if (!fs.existsSync(JELLYFISH_DATA_DIR)) {
        fs.mkdirSync(JELLYFISH_DATA_DIR)
    }
    if (!fs.existsSync(path.join(JELLYFISH_DATA_DIR,"Config"))) {
        fs.mkdirSync(path.join(JELLYFISH_DATA_DIR,"Config"))
    }
    
    if (!fs.existsSync(path.join(JELLYFISH_DATA_DIR,"Scripts"))) {
        fs.mkdirSync(path.join(JELLYFISH_DATA_DIR,"Scripts"))
        //console.log(child_process.execSync(`cd;curl  > default.zip;unzip default.zip; rm default.zip`).toString())
        win.setTitle("Jellyfish | Downloading scripts")
        var f = await fetch('http://jellyfish.thelmgn.com/Jellyfish_Default_Scripts.zip')
        var b = await f.buffer()
        require("extract-zip")(b, { dir: path.join(JELLYFISH_DATA_DIR,"Scripts") })
        exploit.downloadInitialScripts()
    }
    win.setTitle("Jellyfish | Checking for updates")
    getLatest = ((j,platform) => {
        for (var r of j) {
            for (var asset of r.assets) {
                if (asset.name.includes(platform)) return {asset,r};
            }
        }
        return false;
    })
    try {
        var j = await (await fetch("https://api.github.com/repositories/273986462/releases")).json()
        var cv = require("./package.json").version
        var nv = getLatest(j,process.platform)
        if (require("semver").lt(cv, nv.r.tag_name)) {    
            var update = dialog.showMessageBoxSync(win,{
                buttons: ["Quit","Yes"],
                defaultId: 1,
                message: "Update required",
                detail: `The latest version of Jellyfish is ${nv.r.tag_name}, you're running ${cv}, would you like to update now?\n\nChangelog:\n${nv.r.body}`,
            })
            if (update) {
                openUrl(nv.asset.browser_download_url)
            }
            process.exit()
        }
    } catch(e) {
        console.error(e)
    }
    win.setTitle("Jellyfish | Updating theme")
    var preferedTheme = "jellyfish-lsef/jellyfish-ui"
    var pTheme = ""
    try {
        if (fs.existsSync(path.join(udr,"preferedUi.txt"))) {
            pTheme = fs.readFileSync(path.join(udr,"preferedUi.txt"))   
            console.log("Prefered theme file is",pTheme)
        }
        if (preferedTheme.startsWith("local/") && fs.existsSync(path.join(preferedTheme.replace("local/",""),"index.html"))) {
            console.log("Using local theme",preferedTheme)
            pTheme = preferedTheme;
        } else {
            console.log("Checking",preferedTheme)
            var f = await fetch("https://raw.githubusercontent.com/" + preferedTheme + "/master/package.json")
            if (f.ok) {
                console.log("package.json exists on",preferedTheme)
                var j = f.json()
                if (j.keywords && j.keywords.includes && j.keywords.includes("jellyfish-ui")) {
                    console.log(preferedTheme,"has a valid package.json")
                    pTheme = preferedTheme;
                } else {
                    console.log(preferedTheme,"doesn't have a valid package.json")
                }
            }
        }

    } catch(e) {
        console.error(e)
        preferedTheme = "jellyfish-lsef"
    }
    console.log("Updating theme",preferedTheme)
    win.setTitle("Jellyfish | Updating " + preferedTheme)
    var tp = path.join(udr,"themeCache")
    var ac
    var zip = new Promise((a,r) => {ac = a})
    if (preferedTheme.startsWith("local/")) {
        tp = path.join(preferedTheme.replace("local/",""))
    } else {
        var n2u = true
        // Only update if there's an update available
        if (fs.existsSync(path.join(tp, "version.txt")) ) {
            var ver = fs.readFileSync(path.join(tp, "version.txt")).toString()
            if (ver.startsWith(preferedTheme.toLowerCase() + "/")) {
                var f = await fetch(`https://api.github.com/repos/${preferedTheme}/commits?per_page=1`)
                var j = await f.json()
                if (j[0] && ver == preferedTheme.toLowerCase() + "/" + j[0].sha) {
                    tp = path.join(tp, preferedTheme.split("/")[1] + "-master")
                    n2u = false
                }
            }
        }
        if (n2u) {
            if (fs.existsSync(tp)) fs.rmdirSync(tp, {recursive:true});
            fs.mkdirSync(tp)
            var f = await fetch(`https://codeload.github.com/${preferedTheme}/zip/master`)
            var b = await f.buffer()
            var writtenVersion = false
            var a = ac
            ac = () => {}

            var to = 0
            require("extract-zip")(b, { dir: tp,onEntry: (e,z) => {
                console.log("Unzipping",e.fileName)
                to = clearTimeout(to)
                setTimeout(a,1000)
                if (!writtenVersion) {
                    fs.writeFileSync(path.join(udr,"themeCache", "version.txt"),preferedTheme.toLowerCase() + "/" + z.comment)
                    writtenVersion = true
                }
            }})
            tp = path.join(tp, preferedTheme.split("/")[1] + "-master")
        }
    }
    ac()
    zip.then(async () => {
        var themePkg = require(path.join(tp,"package.json"))
        var h = path.join(tp,themePkg.main)
        win.setTitle("Jellyfish | Loading UI")
        win.loadFile(path.resolve(h))
    })
     
    ipcMain.on('inject-button-click',exploit.inject)
    ipcMain.on('check-creds',exploit.checkCreds)
    
    var tmin = 0
    ipcMain.on('set-topmost', (event,arg) => {
        win.setAlwaysOnTop(arg, "floating");
        win.setVisibleOnAllWorkspaces(arg);
        win.setFullScreenable(!arg);
    })
    ipcMain.on('run-script', async (event, arg) => {
        exploit.runScript(arg)
    })
    ipcMain.on("save-script", (evt,script) => {    
        console.log("save-script")
        var loc = dialog.showSaveDialogSync(win, {
            title: "Save Current Script",
            defaultPath: path.join(homedir,"Documents","Jellyfish","Scripts"),
            buttonLabel: "Save",
            message:"Choose where you want to save the current script in the editor.",
            filters: [{extensions: ["lua","txt"]}]
        })
        if (!loc) return;
        if (!loc.endsWith(".lua") && !loc.endsWith(".txt")) {
            loc += ".lua"
        }
        fs.writeFileSync(loc,script)
    })
    exploit.init()
    var key = ""
    
    function traverse(ckey,evt) {
        var scriptsDir = path.join(JELLYFISH_DATA_DIR,"Scripts")
        var walker = require("walker")(scriptsDir)
        walker.filterDir(() => {return key == ckey})
        walker.on("file", function(file,stat) {
            evt.reply('script-found',[key,scriptsDir,file])
        })
    }
    ipcMain.on("startCrawl",(evt,ckey) => {
        key = ckey
        traverse(key,evt)
    })
    ipcMain.on("switch-exploit", (evt,exploit) => {
        if (supportedExploits.includes(exploit)) {
             fs.writeFileSync(path.join(udr,"preferedExploit.txt"),exploit)
             dialog.showMessageBoxSync(win,{
                buttons: ["Restart"],
                defaultId: 1,
                message: "Restart required.",
                detail: `Jellyfish requires a restart to switch exploit.`,
            })
            app.quit()
        } else {
            console.error(exploit,"isn't a valid exploit.")
        }
    })

    function openUrl(url) {
        if (process.platform == "darwin") {
            child_process.spawnSync("open",[url])
        } else {
            child_process.spawnSync("cmd",["/s","/c","start",url,"/b"])
        }
    }
    

    win.once('ready-to-show', () => {
        
        setTimeout(async function() {
            win.show()
            win.webContents.setZoomFactor(1);
            win.webContents.setVisualZoomLevelLimits(1, 1);
            httpListener = function(req,res) {
                var queryObject = url.parse(req.url,true).query;
                console.log(queryObject)
                win.webContents.send("http-request",queryObject)
            }
            
            win.webContents.send("set-exploit",global.exploitName)
            //win.webContents.setLayoutZoomLevelLimits(0, 0);
        },300)
    })

    
    win.webContents.on('new-window', function(event, url){
        event.preventDefault();
        openUrl(url)
    });
    
    
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
    app.quit()
})
