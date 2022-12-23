
const piece_img_names = ["K", "A", "B", "N", "R", "C", "P"];

const NULL_IMG_ZINDEX = 0;
const PIECE_IMG_ZINDEX = 1;
const SELECT_IMG_ZINDEX = 2;
const MOVE_PIECE_IMG_ZINDEX = 3;

const MAX_STEP = 8;

function MOVE_PX(src, dst, step) {
    return Math.floor((src * step + dst * (MAX_STEP - step)) / MAX_STEP + .5) + "px";
}
// 棋盘可视化器，象棋的规则逻辑代码都放在board.js中，这个displayer只是用于可视化。
class UiDisplayer {
    constructor(containerId, boardStyle, pieceStyle, cchess) {
        this.container_ = document.getElementById(containerId);
        this.container_.style.position = "relative";
        this.container_.style.backgroundImage = boardStyle;
        this.container_.style.width = "521px";
        this.container_.style.height = "577px";
        this.style_ = pieceStyle;
        this.cchess_ = cchess;
        this.imgs_ = new Array(256);
        this.flip_ = false;
        this.initResource(false);
    }

    initResource(disableClick) {
        this.selectedImg_ = this.createImage("", SELECT_IMG_ZINDEX, true);
        this.trackStartImg_ = this.createImage("", SELECT_IMG_ZINDEX, true);
        this.trackEndImg_ = this.createImage("", SELECT_IMG_ZINDEX, true);
        this.promptRecords_ = [];
        this.initPieceImage(disableClick);
    }

    setMode(watch) {
        this.imgs_.fill(null);
        this.promptRecords_ = [];
        this.container_.innerHTML = "";
        this.initResource(watch);
    }

    // 设置观看模式
    setWatchMode() {
        this.setMode(true);
    }
    // 设置下棋模式
    setPlayMode() {
        this.setMode(false);
    }

    reset() {
        this.flip_ = false;
        this.setPlayMode();
    }

    createImage(imgPath, zIndex, disableClick) {
        var img = document.createElement("div");
        img.style.width = this.style_.width + "px";
        img.style.height = this.style_.height + "px";
        img.style.position = "absolute";
        img.style.zIndex = zIndex;
        img.style.backgroundSize = "100% auto";
        img.style.backgroundImage = "url(" + imgPath + ")";

        if (disableClick) {
            img.style.pointerEvents = "none";
        }
        this.container_.appendChild(img);
        return img;
    }
    changePos(img, pos) {
        pos = (this.flip_ ? flip_pos(pos) : pos);
        var x = col_of_pos(pos);
        var y = row_of_pos(pos);
        var pos_x = this.style_.left + x * 56;
        var pos_y = this.style_.top + y * 56;
        img.style.top = pos_y + "px";
        img.style.left = pos_x + "px";
    }

    createNullPieceImage(pos, disableClick) {
        var img = this.createImage(this.style_.imgPath + "null.png", NULL_IMG_ZINDEX, false);
        this.changePos(img, pos);
        this.imgs_[pos] = img;

        if (!disableClick) {
            var this_ = this;
            img.onmousedown = function() {
                var p = (this.flip_ ? flip_pos(pos) : pos);
                this_.cchess_.clickPiece(p);
            };
        }

        return img;
    }

    initPieceImage(disableClick) {
        for (var i = 0; i < 256; ++i) {
            if (!in_board(i)) {
                this.imgs_[i] = null;
            } else {
                this.imgs_[i] = this.createNullPieceImage(i, disableClick);
            }
        }
    }

    addPiece(side, type, pos) {
        this.imgs_[pos].style.backgroundImage = "url(" +
            this.style_.imgPath + (side == 0 ? "R" : "B") + piece_img_names[type] + ".png)";
        this.imgs_[pos].style.zIndex = PIECE_IMG_ZINDEX;
    }

    changePieceStyle(pieceStyle) {
        this.style_ = pieceStyle;
        this.container_.innerHTML = "";
        this.initResource();
    }
    changeBoardStyle(boardStyle) {
        this.container_.style.backgroundImage = boardStyle; 
    }

    // 翻转棋盘
    flip() {
        this.flip_ = (this.flip_ ? false : true);
        for (var i = 0; i < 256; ++i) {
            if (!in_board(i)) {
                continue;
            }
            this.changePos(this.imgs_[i], i);
        }
    }

    setSelected(img, pos, side) {
        img.style.display = "block";
        img.style.backgroundImage =
            "url(" + this.style_.imgPath + (side == SIDE_TYPE_RED ? "R" : "B") + "SELECT.png)";
        this.changePos(img, pos);
    }

    unSelected(img) {
        img.style.display = "none";
    }

    selectPiece(pos, side) {
        this.setSelected(this.selectedImg_, pos, side);
    }
    unSelectePiece() {
        this.unSelected(this.selectedImg_);
    }

    addLastTrack(start, end, side) {
        this.setSelected(this.trackStartImg_, start, side);
        this.setSelected(this.trackEndImg_, end, side);
    }

    removeLastTrack() {
        this.unSelected(this.trackStartImg_);
        this.unSelected(this.trackEndImg_);
    }

    addPromptImage(pos, side) {
        var img = this.createImage(this.style_.imgPath + (side == SIDE_TYPE_RED ? "R" : "B") + "NULL.png", SELECT_IMG_ZINDEX, true);
        img.style.opacity = 0.6;
        this.changePos(img, pos);
        this.promptRecords_.push(img);
    }

    showPrompt(mvs, side) {
        for (var idx in mvs) {
            var end = end_of_move(mvs[idx]);
            this.addPromptImage(end, side);
        }
    }
    unshowPrompt() {
        for (var idx in this.promptRecords_) {
            this.container_.removeChild(this.promptRecords_[idx]);
        }
        this.promptRecords_ = [];
    }

    swapImage(img1, img2) {
        var imgPath = img1.style.backgroundImage;
        img1.style.backgroundImage = img2.style.backgroundImage;
        img2.style.backgroundImage = imgPath;
    }

    showImage(img) {
        img.style.opacity = "1";
        img.style.zIndex = PIECE_IMG_ZINDEX;
    }
    unshowImage(img) {
        img.style.opacity = "0";
        img.style.zIndex = NULL_IMG_ZINDEX;
    }

    doMoveAnimation(start, end) {
        var step = MAX_STEP - 1;
        var startPieceImg = this.imgs_[start]
        var endPieceImg = this.imgs_[end];

        var startX = parseInt(startPieceImg.style.left);
        var startY = parseInt(startPieceImg.style.top);
        var endX = parseInt(endPieceImg.style.left);
        var endY = parseInt(endPieceImg.style.top);

        endPieceImg.style.zIndex = MOVE_PIECE_IMG_ZINDEX;
        endPieceImg.style.left = startPieceImg.style.left;
        endPieceImg.style.top = startPieceImg.style.top;

        var timer = setInterval(function() {
            if (step == 0) {
                clearInterval(timer);
                endPieceImg.style.left = endX + "px";
                endPieceImg.style.top = endY + "px";
                endPieceImg.style.zIndex = PIECE_IMG_ZINDEX;
            } else {
                endPieceImg.style.left = MOVE_PX(startX, endX, step);
                endPieceImg.style.top = MOVE_PX(startY, endY, step);
                step--;
            }
        }, 16);
    }

    makeMove(start, end, side, animation) {
        this.addLastTrack(start, end, side);
        this.swapImage(this.imgs_[start], this.imgs_[end]);
        this.unshowImage(this.imgs_[start]);
        this.showImage(this.imgs_[end]);
        if (animation)
            this.doMoveAnimation(start, end);
    }

    undoMove(end, start, animation) {
        this.unshowPrompt();
        this.removeLastTrack();
        this.swapImage(this.imgs_[start], this.imgs_[end]);
        this.showImage(this.imgs_[end]);
        if (animation)
            this.doMoveAnimation(start, end);
        this.showImage(this.imgs_[start]);
    }
}

