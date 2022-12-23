
// 一些UI工具部件
function createMask() {
    var mask = document.createElement("div");
    mask.classList.add("mask-style");
    document.body.appendChild(mask);
    return mask;
}
function createMessageBox(message, hcenter) {
    var mbox = document.createElement("label");
    mbox.innerHTML = message;
    mbox.classList.add("message-box");

    mbox.style.left = (window.innerWidth / 2 - 210) + "px";
    if (hcenter) {
        mbox.style.top = (window.innerHeight / 2 - 5) + "px";
    }

    document.body.appendChild(mbox);
    return mbox;
}

function createDialog() {
    var dialog = document.createElement("div");
    dialog.style.top = (window.innerHeight / 2 - 543 / 2) + "px";
    dialog.style.left = (window.innerWidth / 2 - 405 / 2) + "px";
    dialog.classList.add("dialog-style-common");
    document.body.appendChild(dialog);
    var mask = createMask();
    return { dialog: dialog, mask: mask };
}

function displayMessageBox(message, center) {
    var box = createMessageBox(message, center);

    setTimeout(function() {
        box.style.opacity = "1";
        setTimeout(function() { 
            box.style.opacity = "0";
            setTimeout(function() {
                document.body.removeChild(box); 
            }, 800);  
        }, 2000);
    }, 250);
}

function createButton(text, clickCallback) {
    var btn = document.createElement("div");
    btn.classList.add("btn");
    btn.innerHTML = text;
    btn.onclick = clickCallback;
    return btn;
}

function createInput(type, placeholder) {
    var input_text = document.createElement("input");
    input_text.type = type;
    input_text.placeholder = placeholder;
    input_text.classList.add("itext");
    return input_text;
}
function createText(text) {
    var label = document.createElement("label");
    label.innerHTML = text;
    label.classList.add("dialog-text");
    return label;
}
function createDiv(className, text) {
    var div = document.createElement("div");
    if (text) div.innerHTML = text;
    div.classList.add(className);
    return div;
}
function refresh() {
    location.reload();
}
// UI部件集成器管理
class UIDisplayer {
    constructor() {

    }
    clear() {
        if (this.dlg_)
        {
            var dlg = this.dlg_;
            dlg.dialog.style.opacity = "0";
            dlg.mask.style.opacity = "0";
            setTimeout(function(){
               document.body.removeChild(dlg.dialog);
               document.body.removeChild(dlg.mask); 
            }, 600);
            this.dlg_ = null;
        }
    }
    displayDialog() {
        var dlg = this.dlg_;
        setTimeout(function() {
            dlg.dialog.style.opacity = "1";
            dlg.mask.style.opacity = ".4";
        }, 100);
    }

    displayTextDialog(text) {
        this.clear();
        var dlg = createDialog();
        dlg.dialog.classList.add("dialog-style-1");
        dlg.dialog.innerHTML = text;
        this.dlg_ = dlg;
        this.displayDialog();
    }
    displayLogingingDialog() {
        this.displayTextDialog("正在登录中...");
    }
    displayInitingDialog() {
        this.displayTextDialog("正在初始化中...");
    }
    displayInitFinishDialog() {
        displayMessageBox("初始化完成，请进行登录!", false);
    }
    displayLoginDialog() {
        this.clear();
        var dlg = createDialog();
        var name_input = createInput("text","用户名");
        var pwd_input = createInput("password", "密码");
        name_input.style.marginTop = "170px";
        var btn = createButton("登录", function() {
            var username = name_input.value;
            var passwd = pwd_input.value;
            config.net.toLogin(username, passwd);
        });
        btn.classList.add("login-btn");

        dlg.dialog.appendChild(name_input);
        dlg.dialog.appendChild(pwd_input);
        dlg.dialog.appendChild(btn);
        this.dlg_ = dlg;
        this.displayDialog();
    }

    displayCommonDialog1(text, btnText, cb) {
        this.clear();
        var dlg = createDialog();
        var text = createText(text);
        text.style.fontSize = "25px";
        var btn = createButton(btnText, cb);
        dlg.dialog.appendChild(text);
        dlg.dialog.appendChild(btn);
        this.dlg_ = dlg;
        this.displayDialog();
    }
    displayCommonDialog(text, btn1Text, btn2Text, cb1, cb2) {
        this.clear();
        var dlg = createDialog();
        var text = createText(text);
        var btn1 = createButton(btn1Text, cb1);
        var btn2 = createButton(btn2Text, cb2);
        dlg.dialog.appendChild(text);
        dlg.dialog.appendChild(btn1);
        dlg.dialog.appendChild(btn2);
        this.dlg_ = dlg;
        this.displayDialog();
    }
    displayMatchDialog() {
        var cb1 = function() {
            config.net.toMatch(proto.wsun.RoomType.QUICKLY_PATTERN);
            config.uiDisplayer.displayMatchingDialog();
        };
        var cb2 = function() {
            config.net.toMatch(proto.wsun.RoomType.SLOWLY_PATTERN);
            config.uiDisplayer.displayMatchingDialog();
        };
        this.displayCommonDialog("请选择匹配模式", "十分钟专区", "二十分钟专区", cb1, cb2);
        
    }
    displaySelfForgiveRequestDialog() {
        this.displayCommonDialog("您确定要悔棋吗", "确定", "取消", function() {
            config.net.toForgiveRequest();
            config.uiDisplayer.clear();
        }, function() {
            config.uiDisplayer.clear();
        });
    }
    displayOppForgiveRequestDialog() {
        this.displayCommonDialog("对方请求悔棋", "同意", "拒绝", function() {
            var mv = config.cchess.backStep();
            var fen = config.cchess.board_.toFen();
            config.net.toForgiveResponse(true, mv, fen);
            config.uiDisplayer.clear();
        }, function() {
            config.net.toForgiveResponse(false);
            config.uiDisplayer.clear();
        });
    }
    displayForgiveResponseLabel(agree) {
        displayMessageBox("对方" + (agree ? "同意" : "拒绝") + "悔棋", false);
    }
    displaySelfDrawRequestDialog() {
        this.displayCommonDialog("您确定要和棋吗", "确定", "取消", function() {
            config.net.toDrawRequest();
            config.uiDisplayer.clear();
        }, function() {
            config.uiDisplayer.clear();
        });
    }
    displayOppDrawRequestDialog() {
        this.displayCommonDialog("对方请求和棋", "同意", "拒绝", function() {
            config.net.toDrawResponse(true);
            config.uiDisplayer.clear();
        }, function() {
            config.net.toDrawResponse(false);
            config.uiDisplayer.clear();
        });
    }
    displayDrawResponseLabel() {
        displayMessageBox("对方拒绝和棋", false);
    }
    displayGiveupDialog() {
        this.displayCommonDialog("您确定要认输吗", "确定", "取消", function() {
            config.net.toGiveup();
            config.uiDisplayer.clear();
        }, function() {
            config.uiDisplayer.clear();
        });
    }
    displayMatchingDialog() {
        this.displayCommonDialog1("正在寻找对手...", "取消", function() {
            config.net.toCancelMatch();
            config.uiDisplayer.displayMatchDialog();
        });
    }
    displayDisconnectedDialog() {
        this.displayCommonDialog1("您与服务器断开连接，请刷新页面重新登录", "刷新", refresh);
    }
    displayConnectedErrorDialog() {
        this.displayCommonDialog1("连接服务器失败，请检查您的网络", "刷新", refresh);
    }
    displayResultDialog(overType, changeScore) {
        this.clear();
        var dlg = createDialog();
        var dummy = createDiv("dummy");
        var gameResultImg = createDiv("game-result-img");
        var winUserName;
        var lossUserName;
        if (overType == proto.wsun.GameOver.OverType.SELF_TIMEOUT ||
            overType == proto.wsun.GameOver.OverType.SELF_GIVEUP ||
            overType == proto.wsun.GameOver.OverType.LOSS) {

            gameResultImg.style.backgroundImage = "url(../img/background/play_loss.png)";
            winUserName = config.oppUser.getUsername();
            lossUserName = config.selfUser.getUsername();
        } else if (overType == proto.wsun.GameOver.OverType.DRAW) {
            gameResultImg.style.backgroundImage = "url(../img/background/play_draw.png)";
            winUserName = config.selfUser.getUsername();
            lossUserName = config.oppUser.getUsername();
        } else {
            gameResultImg.style.backgroundImage = "url(../img/background/play_win.png)";
            winUserName = config.selfUser.getUsername();
            lossUserName = config.oppUser.getUsername();
        }
        var info;
        if (overType == proto.wsun.GameOver.OverType.SELF_TIMEOUT) {
            info = "您超时判负";
        } else if (overType == proto.wsun.GameOver.OverType.OPP_TIMEOUT) {
            info = "对方超时判负";
        } else if (overType == proto.wsun.GameOver.OverType.SELF_GIVEUP) {
            info = "您选择认输";
        } else if (overType == proto.wsun.GameOver.OverType.OPP_GIVEUP) {
            info = "对方认输";
        } else if (overType == proto.wsun.GameOver.OverType.WIN) {
            info = "绝杀";
        } else if (overType == proto.wsun.GameOver.OverType.LOSS) {
            info = "困毙";
        } else if (overType == proto.wsun.GameOver.OverType.DRAW) {
            info = "同意和棋";
        }
        var label = createDiv("game-result-text", info);
        var winInfo = createDiv("game-result-info", winUserName + " : " + "+" + changeScore);
        var lossInfo = createDiv("game-result-info", lossUserName + " : " + "-" + changeScore);
        var btn = createButton("再来一局", function() {
            config.cchess.clear();
            config.uiDisplayer.displayMatchDialog();
        });
        dlg.dialog.appendChild(dummy);
        dlg.dialog.appendChild(gameResultImg);
        dlg.dialog.appendChild(label);
        dlg.dialog.appendChild(winInfo);
        dlg.dialog.appendChild(lossInfo);
        dlg.dialog.appendChild(btn);
        this.dlg_ = dlg;
        this.displayDialog();
    }
    displayOppDisconnectedLabel() {
        displayMessageBox("您的对手已掉线!", false);
    }
    displayOppReconnectedLabel() {
        displayMessageBox("您的对手已重新连接!", false);
    }
}

// userInfo operation 用于用户信息显示
function displayUserInfoOnLabel(user, self) {
    var total = user.getTotal();
    var nwin = user.getNwin();
    var nloss = user.getNloss();
    var ndraw = total - nwin - nloss;
    var percent = 0;
    if (total - ndraw != 0)
        percent = Math.floor(nwin * 100 / (nwin + nloss));
    
    document.getElementById((self ? 'self' : 'opp') + 'Username').innerHTML = user.getUsername();
    document.getElementById((self ? 'self' : 'opp') + 'Score').innerHTML = user.getScore();
    document.getElementById((self ? 'self' : 'opp') + 'Percent').innerHTML = percent + "%";
    document.getElementById((self ? 'self' : 'opp') + 'Win').innerHTML = nwin;
    document.getElementById((self ? 'self' : 'opp') + 'Loss').innerHTML = nloss;
    document.getElementById((self ? 'self' : 'opp') + 'Draw').innerHTML = ndraw; 
}
function undisplayUserInfoOnLabel(self) {
    document.getElementById((self ? 'self' : 'opp') + 'Username').innerHTML = "";
    document.getElementById((self ? 'self' : 'opp') + 'Score').innerHTML = "";
    document.getElementById((self ? 'self' : 'opp') + 'Percent').innerHTML = "";
    document.getElementById((self ? 'self' : 'opp') + 'Win').innerHTML = "";
    document.getElementById((self ? 'self' : 'opp') + 'Loss').innerHTML = "";
    document.getElementById((self ? 'self' : 'opp') + 'Draw').innerHTML = ""; 
}
function updateUserInfo(overType, changeScore) {
    var score = config.selfUser.getScore();
    var total = config.selfUser.getTotal() + 1;
    var nwin = config.selfUser.getNwin();
    var nloss = config.selfUser.getNloss();
    if (overType == proto.wsun.GameOver.OverType.SELF_TIMEOUT ||
        overType == proto.wsun.GameOver.OverType.SELF_GIVEUP ||
        overType == proto.wsun.GameOver.OverType.LOSS) {
        
        score -= changeScore;
        nloss += 1;
    } else if (overType == proto.wsun.GameOver.OverType.DRAW) {
        // do nothing
    } else {
        score += changeScore;
        nwin += 1;
    }
    config.selfUser.setScore(score);
    config.selfUser.setTotal(total);
    config.selfUser.setNwin(nwin);
    config.selfUser.setNloss(nloss);
    
    displayUserInfoOnLabel(config.selfUser, true);
}

// 当你在查看棋局的历史走法记录时，没有回到当前最新局面，而对面又走棋了，则会弹出提示
function onForgiveRequestBtnClick() {
    if (config.cchess.turnToPlay()) {
        displayMessageBox("此时轮到您走棋了,不能悔棋哟", false);
    } else {
        config.uiDisplayer.displaySelfForgiveRequestDialog();
    }
}

config.uiDisplayer = new UIDisplayer();
config.uiDisplayer.displayInitingDialog();
