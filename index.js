
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require("fs")
const path = require("path")
const homedir = require('os').homedir();
const windows = require("os").platform() == "win32";
const child_process = require('child_process')
const fetch = require("node-fetch")
const http = require("http")
const url = require('url');
var httpListener = function(){}
try {
    /**
    http.createServer(function(req,res) {
        if (typeof httpListener == "function") {httpListener(req,res)}
    }).listen(7964)
    */
} catch(e) {
    console.error(e)
}


const JELLYFISH_DATA_DIR = path.join(homedir,"Documents","Jellyfish")
global.JELLYFISH_DATA_DIR = JELLYFISH_DATA_DIR

var supportedExploits = [
    "null",
]
if (process.platform == "win32") {
    supportedExploits.push("synx","sirhurt")
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
        show:false,
        webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: false,
            preload: path.resolve("./preload.js")
        },
    })
    win.removeMenu()
    global.win = win
    
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

    if (!fs.existsSync(JELLYFISH_DATA_DIR)) {
        fs.mkdirSync(JELLYFISH_DATA_DIR)
    }
    if (!fs.existsSync(path.join(JELLYFISH_DATA_DIR,"Scripts"))) {
        fs.mkdirSync(path.join(JELLYFISH_DATA_DIR,"Scripts"))
        //console.log(child_process.execSync(`cd;curl  > default.zip;unzip default.zip; rm default.zip`).toString())
        var f = await fetch('http://jellyfish.thelmgn.com/Jellyfish_Default_Scripts.zip')
        var b = await f.buffer()
        require("extract-zip")(b, { dir: path.join(JELLYFISH_DATA_DIR,"Scripts") })
        exploit.downloadInitialScripts()
    }
    if (!fs.existsSync(path.join(JELLYFISH_DATA_DIR,"Config"))) {
        fs.mkdirSync(path.join(JELLYFISH_DATA_DIR,"Config"))
    }
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

    
    // and load the index.html of the app.
    win.loadFile('www/index.html')
    win.webContents.on('new-window', function(event, url){
        event.preventDefault();
        openUrl(url)
    });
    
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
            getLatest = ((j,platform) => {
                for (var r of j) {
                    for (var asset of r.assets) {
                        if (asset.name.includes(platform)) return {asset,r};
                    }
                }
                return false;
            })
            win.webContents.send("set-exploit",global.exploitName)
            try {
                var j = await (await fetch("https://api.github.com/repositories/273986462/releases")).json()
                var cv = require("./package.json").version
                var nv = getLatest(j,process.platform)
                if (cv != nv.r.tag_name) {
                    console.log("diff vers")
            
                    var update = dialog.showMessageBoxSync(win,{
                        buttons: ["No","Yes"],
                        defaultId: 1,
                        message: "Not latest version",
                        detail: `The latest version of Jellyfish is ${nv.r.tag_name}, you're running ${cv}, would you like to update now?\n\nChangelog:\n${nv.r.body}`,
                    })
                    if (update) {
                        return openUrl(nv.asset.browser_download_url)
                    }
                    return
                }
            } catch(e) {
                console.error(e)
            }
            //win.webContents.setLayoutZoomLevelLimits(0, 0);
        },300)
    })
    
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
    app.quit()
})
