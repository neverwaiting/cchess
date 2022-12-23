const INIT_FEN_STRING = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

// 用于走棋计时的辅助函数
function twoNumberString(num) {
    var res = "";
    if (num < 10) res += "0";
    res += num.toString();
    return res;
}
function timeToString(min, sec) {
    return this.twoNumberString(min) + " : " + this.twoNumberString(sec);
}
function displayTimeOnLabel(label, time) {
    var min = Math.floor(time / 60);
    var sec = time - min * 60;
    label.innerHTML = this.timeToString(min, sec);
}

const QUICKLY_PATTERN_TIME = {
    gameTime: 10 * 60,
    stepTime: 60,
    gameSpendTime: 0,
    stepSpendTime: 0
};
const SLOWLY_PATTERN_TIME = {
    gameTime: 20 * 60,
    stepTime: 3 * 60,
    gameSpendTime: 0,
    stepSpendTime: 0
};

function createTimeInfo(timeInfo) {
    return {
        gameTime: timeInfo.gameTime,
        stepTime: timeInfo.stepTime,
        gameSpendTime: timeInfo.gameSpendTime,
        stepSpendTime: timeInfo.stepSpendTime
    };
}

// 走棋计时器
class PlayTimer {
    constructor(timeInfo, timerCallback, self) {
        this.gameTime_ = timeInfo.gameTime;
        this.stepTime_ = timeInfo.stepTime;
        this.gameLeftTime_ = timeInfo.gameTime - timeInfo.gameSpendTime;
        this.stepLeftTime_ = timeInfo.stepTime - timeInfo.stepSpendTime;
        this.timerCallback_ = timerCallback;
        this.progressBar_ = document.getElementById((self ? 'self':'opp') + 'Rect');;
        this.gameTimeLabel_ = document.getElementById((self ? 'self':'opp') + 'GameTime');
        this.stepTimeLabel_ = document.getElementById((self ? 'self':'opp') + 'StepTime');
        displayTimeOnLabel(this.gameTimeLabel_, this.gameLeftTime_);
        displayTimeOnLabel(this.stepTimeLabel_, this.stepLeftTime_);
    }
    displayProgress() {
        this.progressBar_.style.strokeDashoffset = "380";
        this.progressBar_.style.animationDuration = this.stepLeftTime_ + "s";
        this.progressBar_.style.animationPlayState = "running";
        this.progressBar_.classList.add("run-anim"); 
    }
    pauseProgress() {
        this.progressBar_.classList.remove("run-anim");
    }
    count() {
        this.countTimer_ = setInterval(
            function(playTimer) {
                return function() { 
                    --playTimer.stepLeftTime_;
                    --playTimer.gameLeftTime_;
                    displayTimeOnLabel(playTimer.gameTimeLabel_, playTimer.gameLeftTime_);
                    displayTimeOnLabel(playTimer.stepTimeLabel_, playTimer.stepLeftTime_);
                };
            }(this), 
            1000);
    }
    start() {
        this.displayProgress();
        this.count();
        this.innerTimer_ = setTimeout(
            function(playTimer) {
                return function() {
                    playTimer.pauseProgress();
                    clearInterval(playTimer.countTimer_);
                    playTimer.stepLeftTime_ = playTimer.stepTime_;
                    displayTimeOnLabel(playTimer.gameTimeLabel_, playTimer.gameLeftTime_);
                    displayTimeOnLabel(playTimer.stepTimeLabel_, playTimer.stepLeftTime_);
                    var cb = playTimer.timerCallback_;
                    if (cb) cb();
                }
            }(this), 
            this.stepLeftTime_ * 1000);
    }
    pause() {
        this.pauseProgress();
        clearInterval(this.countTimer_);
        clearTimeout(this.innerTimer_);
        this.stepLeftTime_ = this.stepTime_;
        displayTimeOnLabel(this.gameTimeLabel_, this.gameLeftTime_);
        displayTimeOnLabel(this.stepTimeLabel_, this.stepLeftTime_);
    }
}

// 设置当前下棋方的标志（将表示黑方走棋，帅表示红方走棋）
function setPlaySideFlag(side) {
    var flag = document.getElementById("currentSideFlag");
    if (side == SIDE_TYPE_RED)
        flag.style.backgroundImage = "url(../img/pieces/style1/RK.png)";
    else
        flag.style.backgroundImage = "url(../img/pieces/style1/BK.png)";
}

// 播放声音函数
function playSound(soundType) {
    try {
        new Audio("voice/" + soundType).play();
    } catch (e) {
        console.log("<embed src=\"" + "voice/" + soundType +
            ".wav\" hidden=\"true\" autostart=\"true\" loop=\"false\" />");
    }
}

// 根据每一步棋播放对应的声音
function playSoundForMoveRes(mvRes) {
    var turnToSelf = config.cchess.turnToPlay();
    switch (mvRes) {
        case MOVE_RES_ILLEGAL:
            this.playSound("illegal.mp3");
            break;
        case MOVE_RES_REGULAR:
            this.playSound(turnToSelf ? "selfMove.wav" : "oppMove.wav");
            break;
        case MOVE_RES_LORE:
            this.playSound(turnToSelf ? "mate.mp3" : "loss.wav");
            break;
        case MOVE_RES_GENERAL:
            this.playSound(turnToSelf ? "gene.mp3" : "killed.wav");
            break;
        case MOVE_RES_CAPATURED:
            this.playSound("capatured.mp3");
            break;
        case MOVE_RES_KILLED:
            this.playSound("killed.wav");
            break;
        default:
            break;
    }
}

function isBetween(c, x, y) {
    return c.charCodeAt() >= x.charCodeAt() && c.charCodeAt() <= y.charCodeAt();
}

function isNumber(c) {
    return isBetween(c, '0', '9');
}

function isLowerAlpha(c) {
    return isBetween(c, 'a', 'z');
}

function isUpperAlpha(c) {
    return isBetween(c, 'A', 'Z');
}

function isAlpha(c) {
    return isLowerAlpha(c) || isUpperAlpha(c);
}

// 走法打谱表 添加或删除走法
function addStepToRecordContainer(mvString, side) {
    var recordContainer = document.getElementById("stepRecords");
    var step = document.createElement("option");
    step.innerHTML = mvString;
    step.style.border = "2px solid yellowgreen";
    step.style.margin = "2px";
    step.style.fontSize = "25px";
    step.style.letterSpacing = "3px";
    step.style.backgroundColor = "cyan";

    if (side == SIDE_TYPE_RED) {
        step.style.color = "red";
    } else {
        step.style.color = "black";
    }
    recordContainer.add(step);
}
function removeStepFromRecordContainer() {
    var recordContainer = document.getElementById("stepRecords");
    recordContainer.remove(recordContainer.length - 1);
}

class ChineseChess {
    constructor(pattern, fen, timeInfo, turnToMe) {
        config.cchess = this;
        this.side_ = config.side;
        this.switchSoundEffect_ = config.switchSoundEffect;
        this.switchPrompt_ = config.switchPrompt;
        this.switchAnimation_ = config.switchAnimation;
        this.pieceStyleIdx_ = config.pieceStyleIdx;
        this.boardStyleIdx_ = config.boardStyleIdx;

        // 分观看模式和走棋模式，观看模式是用于查看历史局面，不能点击棋子
        this.watchMode_ = false;
        this.historyStepRecords_ = []; // [ {fen, mv}, ... ]

        this.board_ = new Board();
        this.displayer_ = new UiDisplayer("board", BOARD_STYLES[config.boardStyleIdx], PIECE_STYLES[config.pieceStyleIdx], this);
        if (this.side_ == SIDE_TYPE_BLACK)
            this.flipBoard();

        var tmpTimeInfo = (pattern == 0 ? QUICKLY_PATTERN_TIME : SLOWLY_PATTERN_TIME);
        var selfTimeInfo = createTimeInfo(tmpTimeInfo);
        var oppTimeInfo = createTimeInfo(tmpTimeInfo);
        if (timeInfo) {
            selfTimeInfo.gameSpendTime = timeInfo.self.gameSpendTime;
            oppTimeInfo.gameSpendTime = timeInfo.opp.gameSpendTime;
            if (turnToMe) {
                selfTimeInfo.stepSpendTime = timeInfo.self.stepSpendTime;
            } else {
                oppTimeInfo.stepSpendTime = timeInfo.opp.stepSpendTime;
            }
        }

        this.selfPlayTimer_ = new PlayTimer(selfTimeInfo, null, true);
        this.oppPlayTimer_ = new PlayTimer(oppTimeInfo, null, false);


        this.selectedPos_ = 0;
        var fenString = INIT_FEN_STRING;
        if (fen) fenString = fen;
        var side = this.initFromFen(fenString);
        if (side == SIDE_TYPE_BLACK)
            this.board_.changeSide();

        this.curPlayTimer_ = (this.side_ == side ? this.selfPlayTimer_ : this.oppPlayTimer_);
        this.curPlayTimer_.start();
        setPlaySideFlag(side);

        // console.log(this.board_.toFen());
        // console.log("red value:" + this.board_.redPlayer_.value);
        // console.log("black value:" + this.board_.blackPlayer_.value);
    }
    switchPlayTimer() {
        this.curPlayTimer_.pause();
        this.curPlayTimer_ = 
            (this.side_ == this.board_.curSidePlayer_.side ? this.selfPlayTimer_ : this.oppPlayTimer_);
        this.curPlayTimer_.start();

        setPlaySideFlag(this.board_.curSidePlayer_.side);
    }
    
    initFromFen(fenString, unlinkBoard) {
        var row = 0;
        var col = 0;

        for (var i = 0; i < fenString.length; ++i) {
            var c = fenString[i];
            if (isNumber(c)) {
                col += (c.charCodeAt() - '0'.charCodeAt());
            } else if (isAlpha(c)) {
                var side = SIDE_TYPE_RED;
                if (isLowerAlpha(c)) {
                    side = SIDE_TYPE_BLACK;
                }
                var type = getPieceType(c);
                if (!unlinkBoard)
                    this.board_.addPieceToBoard(type, side, convert_to_pos(row, col));
                this.displayer_.addPiece(side, type, convert_to_pos(row, col));
                ++col;
            } else if (c == '/') {
                ++row;
                col = 0;
            } else if (c == ' ') {
                break;
            }
        }

        if (fenString[fenString.length - 1] == 'b')
            return SIDE_TYPE_BLACK;
        else
            return SIDE_TYPE_RED;
    }

    isWatchMode() {
        return this.watchMode_;
    }
    skipToSituationForDisplay(idx, rOffset, isWatchMode) {
        if (!this.watchMode_ && !isWatchMode) return ;

        var step = this.historyStepRecords_[idx];
        if (isWatchMode) {
            this.displayer_.setWatchMode();
            this.watchMode_ = true;
        } else {
            this.displayer_.setPlayMode();
            this.watchMode_ = false;
            if (this.selectedPos_ != 0) {
                this.displayer_.selectPiece(this.selectedPos_, this.side_);
                if (this.switchPrompt_) {
                    var mvs = this.board_.prompt(this.selectedPos_);
                    this.displayer_.showPrompt(mvs, side);
                }
            }
        }

        this.initFromFen(step.fen, true);
        var side = rOffset % 2 == 0 ? 1 - this.side_ : this.side_;
        this.displayer_.addLastTrack(start_of_move(step.mv), end_of_move(step.mv), side);
    }

    addHistoryStep(fen, lastMv) {
        this.historyStepRecords_.push({fen: fen, mv: lastMv});
    }
    play(mv) {
        var side = this.board_.curSidePlayer_.side;
        var res = this.board_.tryMovePiece(mv);
        if (this.switchSoundEffect_)
            playSoundForMoveRes(res);
        if (res != MOVE_RES_ILLEGAL && res != MOVE_RES_KILLED) {
            addStepToRecordContainer(this.board_.toChineseMove(mv), side);
            var send = (this.side_ == side);
            this.board_.play(mv);
            if (this.watchMode_) {
                displayMessageBox("注意!该您下棋咯", false);
            } else {
                this.displayer_.unSelectePiece(this.selectedPos_);
                this.displayer_.unshowPrompt();
                this.displayer_.makeMove(start_of_move(mv), end_of_move(mv), side, this.switchAnimation_);
            }
            
            this.selectedPos_ = 0;
            var fen = this.board_.toFen();
            var over = (res == MOVE_RES_LORE);
            if (send)
                config.net.toMoveStep(over, mv, fen);

            this.switchPlayTimer();
            this.addHistoryStep(fen, mv);
        }
    }
    playIccsMv(iccsMv) {
        var mv = iccs_move_to_move(iccsMv);
        this.play(mv);
    }
    clickPiece(pos) {
        var side = this.board_.curSidePlayer_.side;
        if (this.side_ != side) {
            //console.log("opp click");
            return;
        }

        if (this.board_.isClickSelfPiece(pos)) {
            this.displayer_.unshowPrompt();
            if (this.selectedPos_ == pos) {
                this.displayer_.unSelectePiece();
                this.selectedPos_ = 0;
            } else {
                this.displayer_.selectPiece(pos, side);
                if (this.switchPrompt_) {
                    var mvs = this.board_.prompt(pos);
                    this.displayer_.showPrompt(mvs, side);
                }
                this.selectedPos_ = pos;
            }
            if (this.switchSoundEffect_)
                playSound("select.wav");
        } else {
            if (this.selectedPos_ != 0) {
                var mv = get_move(this.selectedPos_, pos);
                this.play(mv);
            }
        }
    }

    changePieceStyle() {
        if (this.pieceStyleIdx_ == config.pieceStyleIdx) return ;

        this.pieceStyleIdx_ = config.pieceStyleIdx;
        var style = PIECE_STYLES[config.pieceStyleIdx];
        this.displayer_.changePieceStyle(style);

        var pieces = this.board_.pieces_;
        for (var i = 0, len = pieces.length; i < len; ++i) {
            if (!in_board(i)) continue;
            var p = pieces[i];
            if (p) this.displayer_.addPiece(p.sidePlayer.side, p.type, p.pos);
        }

        var mv = this.board_.getLastMove();
        if (mv > 0) {
            var side = this.board_.getOppPlayer().side;
            this.displayer_.addLastTrack(start_of_move(mv), end_of_move(mv), side);
        }
        var pos = this.selectedPos_;
        if(pos != 0) {
            var side = this.board_.curSidePlayer_.side;
            this.displayer_.selectPiece(pos, side);
            if (this.switchPrompt_) {
                var mvs = this.board_.prompt(pos);
                this.displayer_.showPrompt(mvs, side);
            }
        }
    }
    changeBoardStyle() {
        if (this.boardStyleIdx_ == config.boardStyleIdx) return ;

        this.boardStyleIdx_ = config.boardStyleIdx;
        var style = BOARD_STYLES[config.boardStyleIdx];
        this.displayer_.changeBoardStyle(style);
    }

    toggleSoundEffect() {
        this.switchSoundEffect_ = config.switchSoundEffect;
    }
    togglePrompt() {
        this.switchPrompt_ = config.switchPrompt;
        if (!this.switchPrompt_)
            this.displayer_.unshowPrompt();
    }
    toggleAnimation() {
        this.switchAnimation_ = config.switchAnimation;
    }

    flipBoard() {
        this.displayer_.flip();
        var mv = this.board_.getLastMove();
        if (mv > 0) {
            this.displayer_.removeLastTrack();
            var side = this.board_.getOppPlayer().side;
            this.displayer_.addLastTrack(start_of_move(mv), end_of_move(mv), side);
        }
        var pos = this.selectedPos_;
        if(pos != 0) {
            this.displayer_.unSelectePiece();
            var side = this.board_.curSidePlayer_.side;
            this.displayer_.selectPiece(pos, side);
            if (this.switchPrompt_) {
                this.displayer_.unshowPrompt();
                var mvs = this.board_.prompt(pos);
                this.displayer_.showPrompt(mvs, side);
            }
        }
    }

    addLastTrack(mv) {
        var start = start_of_move(mv);
        var end = end_of_move(mv);

        var side = 1 - this.board_.curSidePlayer_.side;
        this.displayer_.addLastTrack(start, end, side);
    }

    backStep() {
        this.displayer_.unshowPrompt();
        this.displayer_.unSelectePiece();
        this.selectedPos_ = 0;

        var mv = this.board_.backStep();
        var start = start_of_move(mv);
        var end = end_of_move(mv);
        this.displayer_.undoMove(end, start, this.switchAnimation_);
        var lastMv = this.board_.getLastMove();
        if (lastMv) {
            this.displayer_.removeLastTrack();
            var side = this.board_.getOppPlayer().side;
            this.displayer_.addLastTrack(start_of_move(lastMv), end_of_move(lastMv), side);
        }
        this.switchPlayTimer();

        if (this.historyStepRecords_.length > 0) {
            this.historyStepRecords_.pop();
            removeStepFromRecordContainer();
        }

        return mv;
    }

    turnToPlay() {
        return this.side_ == this.board_.curSidePlayer_.side;
    }

    clear() {
        this.curPlayTimer_.pause();
        var recordContainer = document.getElementById("stepRecords");
        recordContainer.innerHTML = "";
        this.displayer_.reset();
    }
}

var g_bkMusicPlayer = new Audio("voice/bkMusic.mp3");
g_bkMusicPlayer.loop = true;


// ================= for settting ======================//
function toggleRadioBtnBackground(e, on) {
    if(on)
        e.style.backgroundImage = "url(../img/background/check_on.png)";
    else
        e.style.backgroundImage = "url(../img/background/check_off.png)";
}
function toggleBkMusic(btnId) {
    config.bkMusic = !config.bkMusic;
    if (config.bkMusic) {
        g_bkMusicPlayer.play();
    } else {
        g_bkMusicPlayer.pause();
    }
    toggleRadioBtnBackground(document.getElementById(btnId), config.bkMusic);
}
function toggleSoundEffect(btnId) {
    config.switchSoundEffect = !config.switchSoundEffect;
    config.cchess.toggleSoundEffect();
    toggleRadioBtnBackground(document.getElementById(btnId), config.switchSoundEffect);
}
function togglePrompt(btnId) {
    config.switchPrompt = !config.switchPrompt;
    config.cchess.togglePrompt();
    toggleRadioBtnBackground(document.getElementById(btnId), config.switchPrompt);
}
function toggleAnimation(btnId) {
    config.switchAnimation = !config.switchAnimation;
    config.cchess.toggleAnimation();
    toggleRadioBtnBackground(document.getElementById(btnId), config.switchAnimation);
}

function onChangeBoardStyle()
{
    var select = document.getElementById("boardStyle");
    console.log(select.selectedIndex);
    config.boardStyleIdx = select.selectedIndex;
    config.cchess.changeBoardStyle();
}
function onChangePieceStyle()
{
    var select = document.getElementById("pieceStyle");
    console.log(select.selectedIndex);
    config.pieceStyleIdx = select.selectedIndex;
    config.cchess.changePieceStyle();
}
function onChangeStepRecords() {
    var select = document.getElementById("stepRecords");
    var watchMode = select.selectedIndex == select.length - 1 ? false : true;
    var rOffset = select.length - 1 - select.selectedIndex;
    config.cchess.skipToSituationForDisplay(select.selectedIndex, rOffset, watchMode);
}