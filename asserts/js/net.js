
// 与服务器沟通的数据协议的编解码器
const kHeadLen = 4;
const kNameLen = 4;
const kChecksumLen = 4;
var ProtocolType = {
    LOGIN_REQUEST: 'wsun.LoginRequest',
    LOGIN_SUCCESS_RESPONSE: 'wsun.LoginSuccessResponse',
    LOGIN_FAILED_RESPONSE: 'wsun.LoginFailedResponse',
    MATCH_REQUEST: 'wsun.MatchRequest',
    CANCEL_MATCH_REQUEST: 'wsun.CancelMatchRequest',
    MATCH_RESPONSE: 'wsun.MatchResponse',
    MOVE_STEP: 'wsun.MoveStep',
    GIVEUP: 'wsun.Giveup',
    FORGIVE_REQUEST: 'wsun.ForgiveRequest',
    FORGIVE_RESPONSE: 'wsun.ForgiveResponse',
    DRAW_REQUEST: 'wsun.DrawRequest',
    DRAW_RESPONSE: 'wsun.DrawResponse',
    OPP_DISCONNECTED: 'wsun.OppDisconnected',
    OPP_RECONNECTED: 'wsun.OppReconnected',
    GAME_SITUATION: 'wsun.GameSituation',
    GAME_OVER: 'wsun.GameOver'
};

function utf8ToUtf16(utf8Arr) {
    var utf16Str = '';

    for (var i = 0; i < utf8Arr.length; i++) {
        //每个字节都转换为2进制字符串进行判断
        var one = utf8Arr[i].toString(2);

        //正则表达式判断该字节是否符合>=2个1和1个0的情况
        var v = one.match(/^1+?(?=0)/);

        //多个字节编码
        if (v && one.length == 8) {
            //获取该编码是多少个字节长度
            var bytesLength = v[0].length;

            //首个字节中的数据,因为首字节有效数据长度为8位减去1个0位，再减去bytesLength位的剩余位数
            var store = utf8Arr[i].toString(2).slice(7 - bytesLength);
            for (var st = 1; st < bytesLength; st++) {
                //后面剩余字节中的数据，因为后面字节都是10xxxxxxx，所以slice中的2指的是去除10
                store += utf8Arr[st + i].toString(2).slice(2);
            }

            //转换为Unicode码值
            utf16Str += String.fromCharCode(parseInt(store, 2));

            //调整剩余字节数
            i += bytesLength - 1;
        } else {
            //单个字节编码，和Unicode码值一致，直接将该字节转换为UTF-16
            utf16Str += String.fromCharCode(utf8Arr[i]);
        }
    }

    return utf16Str;
}
function utf16ToUtf8(utf16Str) {
    var utf8Arr = [];
    var byteSize = 0;
    for (var i = 0; i < utf16Str.length; i++) {
        //获取字符Unicode码值
        var code = utf16Str.charCodeAt(i);

        //如果码值是1个字节的范围，则直接写入
        if (code >= 0x00 && code <= 0x7f) {
            byteSize += 1;
            utf8Arr.push(code);

            //如果码值是2个字节以上的范围，则按规则进行填充补码转换
        } else if (code >= 0x80 && code <= 0x7ff) {
            byteSize += 2;
            utf8Arr.push((192 | (31 & (code >> 6))));
            utf8Arr.push((128 | (63 & code)));
        } else if ((code >= 0x800 && code <= 0xd7ff)
            || (code >= 0xe000 && code <= 0xffff)) {
            byteSize += 3;
            utf8Arr.push((224 | (15 & (code >> 12))));
            utf8Arr.push((128 | (63 & (code >> 6))));
            utf8Arr.push((128 | (63 & code)));
        } else if(code >= 0x10000 && code <= 0x10ffff ){
            byteSize += 4;
            utf8Arr.push((240 | (7 & (code >> 18))));
            utf8Arr.push((128 | (63 & (code >> 12))));
            utf8Arr.push((128 | (63 & (code >> 6))));
            utf8Arr.push((128 | (63 & code)));
        }
    }

    return utf8Arr;
}
function getCheckSum(data) {
    return ADLER32.buf(data, 1);
}
function copyTo(toDataView, fromArray, len, offset) {
    for(var i = 0; i < len; ++i) {
        toDataView.setUint8(i + offset, fromArray[i]); 
    } 
}
function encodeTypeName(msg_type) {
    return utf16ToUtf8(msg_type + '\0');
}
function decodeTypeName(arrayBuffer) {
    return utf8ToUtf16(arrayBuffer);
}

function getMessageInstance(msg_type, bytes) {
    var message;
    if (msg_type == ProtocolType.LOGIN_REQUEST)
        message = new proto.wsun.LoginRequest();
    else if (msg_type == ProtocolType.LOGIN_SUCCESS_RESPONSE)
        message = proto.wsun.LoginSuccessResponse.deserializeBinary(bytes);        
    else if (msg_type == ProtocolType.LOGIN_FAILED_RESPONSE)
        message = proto.wsun.LoginFailedResponse.deserializeBinary(bytes);        
    else if (msg_type == ProtocolType.MATCH_REQUEST)
        message = new proto.wsun.MatchRequest();
    else if (msg_type == ProtocolType.CANCEL_MATCH_REQUEST)
        message = new proto.wsun.CancelMatchRequest();
    else if (msg_type == ProtocolType.MATCH_RESPONSE)
        message = proto.wsun.MatchResponse.deserializeBinary(bytes);
    else if (msg_type == ProtocolType.MOVE_STEP) {
        if (bytes) message = proto.wsun.MoveStep.deserializeBinary(bytes);
        else message = new proto.wsun.MoveStep();
    }
    else if (msg_type == ProtocolType.GIVEUP) {
        if (bytes) message = proto.wsun.Giveup.deserializeBinary(bytes);
        else message = new proto.wsun.Giveup();
    }    
    else if (msg_type == ProtocolType.FORGIVE_REQUEST) {
        if (bytes) message = proto.wsun.ForgiveRequest.deserializeBinary(bytes);
        else message = new proto.wsun.ForgiveRequest();
    }  
    else if (msg_type == ProtocolType.FORGIVE_RESPONSE) {
        if (bytes) message = proto.wsun.ForgiveResponse.deserializeBinary(bytes);
        else message = new proto.wsun.ForgiveResponse();
    } 
    else if (msg_type == ProtocolType.DRAW_REQUEST) {
        if (bytes) message = proto.wsun.DrawRequest.deserializeBinary(bytes);
        else message = new proto.wsun.DrawRequest();
    }
    else if (msg_type == ProtocolType.DRAW_RESPONSE) {
        if (bytes) message = proto.wsun.DrawResponse.deserializeBinary(bytes);
        else message = new proto.wsun.DrawResponse();
    }
    else if (msg_type == ProtocolType.OPP_DISCONNECTED)
        message = proto.wsun.OppDisconnected.deserializeBinary(bytes);
    else if (msg_type == ProtocolType.OPP_RECONNECTED)
        message = proto.wsun.OppReconnected.deserializeBinary(bytes);
    else if (msg_type == ProtocolType.GAME_SITUATION)
        message = proto.wsun.GameSituation.deserializeBinary(bytes);
    else if (msg_type == ProtocolType.GAME_OVER)
        message = proto.wsun.GameOver.deserializeBinary(bytes);
    return message;
}

function ProtobufMesssageEncode(msg_type, data) {
    var req = getMessageInstance(msg_type);
    if (msg_type == ProtocolType.LOGIN_REQUEST) {
        req.setUsername(data.username);
        req.setPasswd(data.passwd);
    } else if (msg_type == ProtocolType.MATCH_REQUEST) {
        req.setType(data.type);
    } else if (msg_type == ProtocolType.CANCEL_MATCH_REQUEST) {
        // no data
    } else if (msg_type == ProtocolType.MOVE_STEP) {
        req.setOver(data.over);
        req.setMv(data.mv);
        req.setFen(data.fen);
    } else if (msg_type == ProtocolType.DRAW_REQUEST) {
        // no data
    } else if (msg_type == ProtocolType.DRAW_RESPONSE) {
        req.setAgree(data.agree);
    } else if (msg_type == ProtocolType.FORGIVE_REQUEST) {
        // no data
    } else if (msg_type == ProtocolType.FORGIVE_RESPONSE) {
        req.setAgree(data.agree);
        if (data.agree) {
            req.setFen(data.fen);
            req.setMv(data.mv);
        }
    } else if (msg_type == ProtocolType.GIVEUP) {
        // no data
    } else {
        console.log("not found message");
    }

    var typeName = encodeTypeName(msg_type);
    var typeNameLen = typeName.length;
    var msgBinary = req.serializeBinary();
    var msgBinaryLen = msgBinary.length;

    var arrayBufferView = new DataView(new ArrayBuffer(kNameLen + typeNameLen + msgBinaryLen));
    arrayBufferView.setUint32(0, typeNameLen);
    copyTo(arrayBufferView, typeName, typeNameLen, kNameLen);
    copyTo(arrayBufferView, msgBinary, msgBinaryLen, kNameLen + typeNameLen);
    var array = new Uint8Array(arrayBufferView.buffer);
    var checksum = getCheckSum(array);
    var arrayBufferViewLen = arrayBufferView.buffer.byteLength;
    //console.log(arrayBufferView.buffer);

    var totalBufferLen = kNameLen + typeNameLen + msgBinaryLen + kChecksumLen;
    var totalBufferView = new DataView(new ArrayBuffer(totalBufferLen + 4));
    totalBufferView.setUint32(0, totalBufferLen);
    
    copyTo(totalBufferView, array, arrayBufferViewLen, kHeadLen);
    totalBufferView.setInt32(totalBufferLen, checksum);
    return totalBufferView.buffer;
}

function reponseMessage(typeName, message) {
    if (typeName == ProtocolType.LOGIN_SUCCESS_RESPONSE) {
        config.net.responseLoginSuccess(message.getUserinfo());
    } else if (typeName == ProtocolType.LOGIN_FAILED_RESPONSE) {
        if (message.getReason() == proto.wsun.LoginFailedResponse.FailedReason.MULTI_LOGIN)
            config.net.reponseLoginFailed("您的账号已在其他地方登录!");
        else
            config.net.reponseLoginFailed("用户名或密码不正确!");
    } else if (typeName == ProtocolType.MATCH_RESPONSE) {
        config.net.reponseMatch(message.getSelftype(), message.getType(), message.getOppuser());
    } else if (typeName == ProtocolType.MOVE_STEP) {
        config.net.responseMoveStep(message.getOver(), message.getMv(), message.getFen());
    } else if (typeName == ProtocolType.DRAW_REQUEST) {
        config.net.responseDrawRequest();
    } else if (typeName == ProtocolType.DRAW_RESPONSE) {
        config.net.responseDrawRes(message.getAgree());
    } else if (typeName == ProtocolType.OPP_DISCONNECTED) {
        config.net.responseOppDisconnected();
    } else if (typeName == ProtocolType.FORGIVE_REQUEST) {
        config.net.responseForgiveRequest();
    } else if (typeName == ProtocolType.FORGIVE_RESPONSE) {
        config.net.responseForgiveRes(message.getAgree());
    } else if (typeName == ProtocolType.OPP_RECONNECTED) {
        config.net.responseOppReconnected();
    } else if (typeName == ProtocolType.GAME_SITUATION) {
        config.net.responseGameSituation(message.getFen(), message.getLastmv(), 
                                        message.getRed(), message.getTurntome(), message.getRoomtype(), 
                                        message.getSelf(), message.getOpp(),
                                        message.getSelftime(), message.getOpptime());
    } else if (typeName == ProtocolType.GAME_OVER) {
        config.net.responseGameOver(message.getType(), message.getChangescore(),
                                    message.getSelfspendgametime(), message.getOppspendgametime());
    } else {
        console.log("not found message reponse callback");
    }
}

function ProtobufMesssageDecode(arrayBuffer) {
    var dataView = new DataView(arrayBuffer);
    var totalLen = dataView.getUint32(0);
    var typeNameLen = dataView.getUint32(kHeadLen);
    var checksum = dataView.getInt32(totalLen);
    
    var vertify_checksum = getCheckSum(new Uint8Array(dataView.buffer.slice(kHeadLen, totalLen)));
    if (checksum != vertify_checksum) {
        console.log("error_message");
    } else {
        var typeName = decodeTypeName(new Uint8Array(dataView.buffer.slice(kHeadLen + kNameLen, kHeadLen + kNameLen + typeNameLen - 1)));
        var message = getMessageInstance(typeName, dataView.buffer.slice(kHeadLen + kNameLen + typeNameLen, totalLen));
        reponseMessage(typeName, message);
    }
}

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

// 主要负责网络数据的收发响应
class Net {
    constructor() {
        config.net = this;
        this.websocket_ = new WebSocket(config.address);
        this.websocket_.onopen = function() {
            //alert("成功连接服务器!请进行登录");
            config.uiDisplayer.displayInitFinishDialog();
            config.uiDisplayer.displayLoginDialog();
            //displayLoginDialog();
        };
        this.websocket_.onerror = function(evt) {
            //alert("与服务器断开连接，请检查网络是否正常！");
        };
        this.websocket_.onclose = function() {
            //alert("与服务器断开连接，请检查网络是否正常！");
            config.uiDisplayer.displayConnectedErrorDialog();
        };
        this.websocket_.onmessage = function(net) {
            return function(evt) {
                ProtobufMesssageDecode(evt.data);
            };
        }(this);
        this.websocket_.binaryType = "arraybuffer";
    }
    // for response 接收到服务器的各种响应消息的回调函数
    responseLoginSuccess(user) {
        displayUserInfoOnLabel(user, true);
        config.selfUser = user;
        config.uiDisplayer.displayMatchDialog();
    }
    reponseLoginFailed(reson) {
        displayMessageBox(reson, true);
    }
    reponseMatch(selfType, roomType, oppUser) {
        config.uiDisplayer.clear();
        config.oppUser = oppUser;
        displayUserInfoOnLabel(oppUser, false);
        var side = SIDE_TYPE_RED;
        if (selfType == proto.wsun.MatchResponse.PlayerType.BLACK)
            side = SIDE_TYPE_BLACK;
        config.side = side;
        var cchess = new ChineseChess(roomType);
        this.cchess_ = cchess;
    }
    responseMoveStep(over, mv, fen) {
        this.cchess_.play(mv);
    }
    responseDrawRequest() {
        config.uiDisplayer.displayOppDrawRequestDialog();
    }
    responseDrawRes() {
        config.uiDisplayer.displayDrawResponseLabel();
    }
    responseForgiveRequest() {
        // 有可能对方发送的悔棋请求在自己走完棋之后到达的
        // 那么直接向服务器发送拒绝响应, 不显示弹框
        if (config.cchess.turnToPlay())
            config.uiDisplayer.displayOppForgiveRequestDialog();
        else
            this.toForgiveResponse(false);
    }
    responseForgiveRes(agree) {
        config.uiDisplayer.displayForgiveResponseLabel(agree);
        if (agree) {
            this.cchess_.backStep();
        }
    }
    responseOppDisconnected() {
        config.uiDisplayer.displayOppDisconnectedLabel();
    }
    responseOppReconnected() {
        config.uiDisplayer.displayOppReconnectedLabel();
    }
    responseGameSituation(fen, mv, isRed, turnToMe, roomType, selfUser, oppUser, selfTime, oppTime) {
        config.uiDisplayer.clear();
        config.selfUser = selfUser;
        config.oppUser = oppUser;
        displayUserInfoOnLabel(selfUser, true);
        displayUserInfoOnLabel(oppUser, false);
        config.side = (isRed ? SIDE_TYPE_RED : SIDE_TYPE_BLACK);
        var timeInfo = {
            self: {
                gameSpendTime: selfTime.getGamespendtime(),
                stepSpendTime: selfTime.getStepspendtime()
            },
            opp: {
                gameSpendTime: oppTime.getGamespendtime(),
                stepSpendTime: oppTime.getStepspendtime()
            }
        };
        var cchess = new ChineseChess(roomType, fen, timeInfo, turnToMe);
        cchess.addLastTrack(mv);
        this.cchess_ = cchess;
    }
    responseGameOver(overType, changeScore, selfGameTime, oppGameTime) {
        setTimeout(function() {
            undisplayUserInfoOnLabel(false);
            updateUserInfo(overType, Math.abs(changeScore));
            config.uiDisplayer.displayResultDialog(overType, Math.abs(changeScore));
            config.oppUser = null;
        }, 1000);
    }
    
    // 向服务器发送各种请求
    sendMessage(msg_type, data) {
        var buffer = ProtobufMesssageEncode(msg_type, data);
        //console.log(buffer);
        this.websocket_.send(buffer);
    }
    // for request
    toLogin(username, passwd) {
        var data = { username: username, passwd: passwd };
        this.sendMessage(ProtocolType.LOGIN_REQUEST, data);
    }
    toMatch(type) {
        var data = { type: type };
        this.sendMessage(ProtocolType.MATCH_REQUEST, data);
    }
    toCancelMatch() {
        this.sendMessage(ProtocolType.CANCEL_MATCH_REQUEST, null);
    }
    toMoveStep(over, mv, fen) {
        var data = { over: over, mv: mv, fen: fen };
        this.sendMessage(ProtocolType.MOVE_STEP, data);
    }
    toForgiveRequest() {
        this.sendMessage(ProtocolType.FORGIVE_REQUEST, null);
    }
    toForgiveResponse(agree, mv, fen) {
        var data = { agree: agree, mv: mv, fen: fen };
        this.sendMessage(ProtocolType.FORGIVE_RESPONSE, data);
    }
    toDrawRequest() {
        this.sendMessage(ProtocolType.DRAW_REQUEST, null);
    }
    toDrawResponse(agree) {
        var data = { agree: agree };
        this.sendMessage(ProtocolType.DRAW_RESPONSE, data);
    }
    toGiveup() {
        this.sendMessage(ProtocolType.GIVEUP, null);
    }

}

window.onload = function() {
    config.uiDisplayer = new UIDisplayer();
    config.uiDisplayer.displayInitingDialog();
    config.net = new Net();
}