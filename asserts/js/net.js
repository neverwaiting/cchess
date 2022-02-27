
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
    config.net = new Net();
}
