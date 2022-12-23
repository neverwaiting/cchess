// 主要用于象棋的底层逻辑

function getPieceType(c) {
    switch (c) {
        case 'K':
        case 'k':
            return PIECE_TYPE_KING;
        case 'A':
        case 'a':
            return PIECE_TYPE_ADVISOR;
        case 'B':
        case 'b':
            return PIECE_TYPE_BISHOP;
        case 'N':
        case 'n':
            return PIECE_TYPE_KNIGHT;
        case 'R':
        case 'r':
            return PIECE_TYPE_ROOK;
        case 'C':
        case 'c':
            return PIECE_TYPE_CANNON;
        case 'P':
        case 'p':
            return PIECE_TYPE_PAWN;
        default:
            return -1;
    }
}

// for piece
function createPiece(type, sidePlayer, pos) {
    return { type: type, sidePlayer: sidePlayer, pos: pos, show: true, name: PIECE_NAME_STRING[sidePlayer.side][type] };
}
function getPieceValue(p) {
    var pos = p.sidePlayer.side == SIDE_TYPE_RED ? p.pos : flip_pos(p.pos);
	return array_piece_value[p.type][pos];
}
function cmpPieceSameSide(p1, p2) {
    return p2 && p1.sidePlayer.side == p2.sidePlayer.side;
}
function cmpPieceOppSide(p1, p2) {
    return p2 && p1.sidePlayer.side != p2.sidePlayer.side;
}
function getPieceForwardStep(piece) {
    // down side 帥(将)在下方 -16 ,否则+16
    return ((piece.sidePlayer.kingPiece.pos & 0x80) ? 
    piece.pos - 16 : piece.pos + 16); 
}

// for player
function createPlayer(side) {
    return {side: side, value: 0, kingPiece: null, pieces: [] };
}
function addPieceValueToPlayer(player, piece) {
    player.value += getPieceValue(piece);
}
function delPieceValueToPlayer(player, piece) {
    player.value -= getPieceValue(piece);
}
function addPieceToPlayer(player, piece) {
	if (piece.type == PIECE_TYPE_KING)
	{
		player.kingPiece = piece;
	}
    player.pieces.push(piece);
	addPieceValueToPlayer(player, piece);
}

class Board {
    constructor() {
        this.redPlayer_ = createPlayer(SIDE_TYPE_RED);
        this.blackPlayer_ = createPlayer(SIDE_TYPE_BLACK);
        this.curSidePlayer_ = this.redPlayer_;
        this.pieces_ = new Array(256).fill(null); //elment = piece:{sidePlayer, type, pos, show, name}
        this.curStepIdx_ = 0;
        this.historyStepRecords_ = []; // step {mv, endPiece, inCheck, zobristKey }

        //this.zobristHelper_ = new ZobristHelper();
        //this.machine_ = new Machine(this);
    }

    addPieceToBoard(type, side, pos) {
        var sidePlayer = (side == SIDE_TYPE_RED ? this.redPlayer_ : this.blackPlayer_);
        var piece = createPiece(type, sidePlayer, pos);
        this.pieces_[pos] = piece;
        addPieceToPlayer(sidePlayer, piece);
        //this.zobristHelper_.updateByChangePiece(side, type, pos);
    }
    
    changeSide() {
        this.curSidePlayer_ = this.getOppPlayer();
        //this.zobristHelper_.updateByChangeSide();
    }

    curSidePlayer() {
        return this.curSidePlayer_;
    }

    getOppPlayerByPlayer(sidePlayer) {
        return (sidePlayer == this.redPlayer_ ? this.blackPlayer_ : this.redPlayer_);
    }

    getOppPlayer() {
        return this.getOppPlayerByPlayer(this.curSidePlayer_);
    }

    // 局面评价函数
    evaluate() {
        return this.curSidePlayer_.value - this.getOppPlayer().value + 3;
    }

    legalMovePiece(piece, dest) {
        if (piece.type == PIECE_TYPE_KING) {
            // 判断在九宫的走法是否合理
            if(in_fort(dest) && array_legal_span[dest - piece.pos + 256] == 1)
                return true;
        }
        if (piece.type == PIECE_TYPE_ADVISOR) {
            return in_fort(dest) && array_legal_span[dest - piece.pos + 256] == 2;
        } else if (piece.type == PIECE_TYPE_BISHOP) {
            return same_half(piece.pos, dest) &&
                         array_legal_span[dest - piece.pos + 256] == 3 &&
                         !this.pieces_[((piece.pos + dest) >> 1)];
        } else if (piece.type == PIECE_TYPE_KNIGHT) {
            return piece.pos != piece.pos + array_knight_pin[dest - piece.pos + 256] && 
                         !this.pieces_[(piece.pos + array_knight_pin[dest - piece.pos + 256])];
        } else if (piece.type == PIECE_TYPE_KING || piece.type == PIECE_TYPE_ROOK || piece.type == PIECE_TYPE_CANNON) {
            var offset = get_offset(piece.pos, dest);
            if (offset == 0) {
                return false;
            } else {
                var curPos = piece.pos + offset;
                while (curPos != dest && !this.pieces_[curPos]) {
                    curPos += offset;
                }
                if (curPos == dest) {
                    if (piece.type == PIECE_TYPE_KING) {
                        return this.pieces_[dest] && this.pieces_[dest].type == PIECE_TYPE_KING;
                    } else if (piece.type == PIECE_TYPE_ROOK) {
                        return !cmpPieceSameSide(piece, this.pieces_[dest]);
                    } else {
                        return !this.pieces_[dest];
                    }
                } else {
                    if (piece.type == PIECE_TYPE_KING || piece.type == PIECE_TYPE_ROOK)
                        return false;
    
                    curPos += offset;
                    while (curPos != dest && !this.pieces_[curPos]) {
                        curPos += offset;
                    }
                    return curPos == dest;
                }
            }
        } else if (piece.type == PIECE_TYPE_PAWN) {
            if (!same_half(piece.sidePlayer.kingPiece.pos, piece.pos) && 
                    (piece.pos + 1 == dest || piece.pos - 1 == dest)) {
                return true;
            }
            return dest == getPieceForwardStep(piece);
        }
    
        return false;
    }

    legalMove(mv) {
        var legal = false;
        var piece = this.pieces_[start_of_move(mv)];
        var dest = end_of_move(mv);
        if (piece && piece.show && 
                piece.sidePlayer == this.curSidePlayer_ && 
                !cmpPieceSameSide(piece, this.pieces_[dest]) &&
                this.legalMovePiece(piece, dest))
        {
            this.makeMove(mv);
            if (!this.willKillSelfKing())
            {
                legal = true;
            }
            this.undoMove();
        }
        return legal;
    }

    willKillKing(player) {
        var oppPlayer = this.getOppPlayerByPlayer(player);
        var pieces = oppPlayer.pieces;
        var kingPiece = player.kingPiece;
        var len = oppPlayer.pieces.length;
    
        for (var i = 0; i < len; ++i) {
            if (pieces[i].show && this.legalMovePiece(pieces[i], kingPiece.pos)) {
                return true;
            }
        }
        return false;
    }
    // 是否被将军
    willKillSelfKing() {
        return this.willKillKing(this.curSidePlayer_);
    }
    // 是否将军
    willKillOppKing() {
        return this.willKillKing(this.getOppPlayer());
    }

    generateMoves(piece, capatured) {
        var mvs = [];
        // 必须保证棋子在棋盘上
        if (!piece || !piece.show) return 0;

        if (piece.type == PIECE_TYPE_KING) {
            // 九宫内的走法
            for (var i = 0; i < 4; ++i) {
                var dest = piece.pos + array_king_delta[i];
                if (!in_fort(dest)) continue;

                if (!capatured) {
                    if (!this.pieces_[dest]) {
                        mvs.push(get_move(piece.pos, dest));
                    }
                }
                
                if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                    mvs.push(get_move(piece.pos, dest));
                }
            }
        } else if (piece.type == PIECE_TYPE_ADVISOR) {
            for (var i = 0; i < 4; ++i) {
                var dest = piece.pos + array_advisor_delta[i];
                if (!in_fort(dest)) continue;

                if (!capatured) {
                    if (!this.pieces_[dest]) {
                        mvs.push(get_move(piece.pos, dest));
                    }
                }
                
                if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                    mvs.push(get_move(piece.pos, dest));
                }
            }
        } else if (piece.type == PIECE_TYPE_BISHOP) {
            for (var i = 0; i < 4; ++i) {
                var dest = piece.pos + array_advisor_delta[i];

                if (!in_board(dest) || 
                        !same_half(piece.pos, dest) || 
                        this.pieces_[dest]) {
                    continue;
                }

                dest += array_advisor_delta[i];
                if (!capatured) {
                    if (!this.pieces_[dest]) {
                        mvs.push(get_move(piece.pos, dest));
                    }
                }
                
                if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                    mvs.push(get_move(piece.pos, dest));
                }
            }
        } else if (piece.type == PIECE_TYPE_KNIGHT) {
            for (var i = 0; i < 4; ++i) {
                var dest = piece.pos + array_king_delta[i];
                if (this.pieces_[dest]) continue;

                for (var j = 0; j < 2; ++j) {
                    dest = piece.pos + array_knight_delta[i][j];
                    if (!in_board(dest)) continue;

                    if (!capatured) {
                        if (!this.pieces_[dest]) {
                            mvs.push(get_move(piece.pos, dest));
                        }
                    }
                    
                    if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                        mvs.push(get_move(piece.pos, dest));
                    }
                }
            }
        } else if (piece.type == PIECE_TYPE_ROOK) {
            for (var i = 0; i < 4; ++i) {
                var nDelta = array_king_delta[i];
                var dest = piece.pos + nDelta;
                while (in_board(dest)) {
                    if (this.pieces_[dest]) {
                        if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                            mvs.push(get_move(piece.pos, dest));
                        }
                        break;
                    }
                    if (!capatured) {
                        mvs.push(get_move(piece.pos, dest));
                    }
                    dest += nDelta;
                }
            }
        } else if (piece.type == PIECE_TYPE_CANNON) {
            for (var i = 0; i < 4; ++i) {
                var nDelta = array_king_delta[i];
                var dest = piece.pos + nDelta;
                while (in_board(dest)) {
                    if (!this.pieces_[dest]) {
                        if (!capatured) {
                            mvs.push(get_move(piece.pos, dest));
                        }
                    }
                    else break;

                    dest += nDelta;
                }
                dest += nDelta;
                while (in_board(dest)) {
                    if (!this.pieces_[dest]) dest += nDelta;
                    else {
                        if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                            mvs.push(get_move(piece.pos, dest));
                        }
                        break;
                    }
                }
            }
        } else if (piece.type == PIECE_TYPE_PAWN) {
            var dest = getPieceForwardStep(piece);
            if (in_board(dest)) {
                // capatured move
                if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                    mvs.push(get_move(piece.pos, dest));
                }

                if (!capatured && !this.pieces_[dest]) {
                    mvs.push(get_move(piece.pos, dest));
                }
            }

            // 过河兵
            if (!same_half(piece.sidePlayer.kingPiece.pos, piece.pos)) {
                for (var nDelta = -1; nDelta <= 1; nDelta += 2) {
                    dest = piece.pos + nDelta;

                    if (!in_board(dest)) continue;

                    // capatured move
                    if (cmpPieceOppSide(piece, this.pieces_[dest])) {
                        mvs.push(get_move(piece.pos, dest));
                    }

                    if (!capatured && !this.pieces_[dest]) {
                        mvs.push(get_move(piece.pos, dest));
                    }
                }
            }
        }
        return mvs;
    }

    // 不检查走完后是否被将军
    generateAllMovesNonCheck(capatured) {
        var mvs = [];
        var pieces = this.curSidePlayer_.pieces;
        for (var i = 0; i < 16; ++i)
        {
            var pmvs = this.generateMoves(pieces[i], capatured);
            mvs = mvs.concat(pmvs);
        }
        return mvs;
    }

    // 绝对合法的走法
    generateAllMoves(capatured) {
        var result = [];
        var mvs = this.generateAllMovesNonCheck(capatured);
        for (var i = 0, len = mvs.length; i < len; ++i) {
            this.makeMove(mvs[i]);
            if (!this.willKillSelfKing()) {
                result.push(mvs[i]);
            }
            this.undoMove();
        }
        return result;
    }

    // 是否被困毙
    noWayToMove() {
        var mvs = this.generateAllMoves(false);
        return mvs.length == 0;
    }

    addPiece(piece, pos) {
        if (!piece) return;

        piece.show = true;
        piece.pos = pos;
        this.pieces_[pos] = piece;
        addPieceValueToPlayer(piece.sidePlayer, piece);

        var side = piece.sidePlayer.side;
        //this.zobristHelper_.updateByChangePiece(side, piece.type, pos);
    }

    delPiece(pos) {
        var piece = this.pieces_[pos];
        if (!piece) return null;

        piece.show = false;
        delPieceValueToPlayer(piece.sidePlayer, piece);
        this.pieces_[pos] = null;

        var side = piece.sidePlayer.side;
        //this.zobristHelper_.updateByChangePiece(side, piece.type, pos);

        return piece;
    }

    addHistoryStep(mv, endPiece, inCheck, zobristKey) {
        ++this.curStepIdx_;
        this.historyStepRecords_.push({mv: mv, endPiece: endPiece, inCheck: inCheck, zobristKey: zobristKey});
    }

    removeLastHistoryStep() {
        if (this.historyStepRecords_.length == 0)
            return null;
        --this.curStepIdx_;
        return this.historyStepRecords_.pop();
    }

    makeMove(mv) {
        var start = start_of_move(mv);
        var end = end_of_move(mv);
    
        //var zkey = this.zobristHelper_.zobrist.key;
    
        var endPiece = this.delPiece(end);
        var retPiece = this.delPiece(start);
        this.addPiece(retPiece, end);
    
        var inCheck = this.willKillOppKing();
    
        this.addHistoryStep(mv, endPiece, inCheck, 0);
    }

    undoMove() {
        var step = this.removeLastHistoryStep();
        var mv = step.mv;
        var start = start_of_move(mv);
        var end = end_of_move(mv);

        var retPiece = this.delPiece(end);
        this.addPiece(retPiece, start);
        this.addPiece(step.endPiece, end);
    }
    makeNullMove() {}
    undoNullMove() {}

    // 返回每一步棋的种类，如吃子、将军、被将军、绝杀、困毙、一般走子、非法走子
    tryMovePiece(mv) {
        var start = start_of_move(mv);
        var end = end_of_move(mv);
        var piece = this.pieces_[start];
        if (piece && this.legalMovePiece(piece, end)) {
            this.makeMove(mv);
            if (this.willKillSelfKing()) {
                this.undoMove();
                return MOVE_RES_KILLED;
            }
            this.changeSide();
            if (this.noWayToMove()) {
                this.undoMove();
                this.changeSide();
                return MOVE_RES_LORE;
            }
            this.changeSide();
            if (this.willKillOppKing()) {
                this.undoMove();
                return MOVE_RES_GENERAL;
            }
            this.undoMove();
            if (this.pieces_[end]) {
                return MOVE_RES_CAPATURED;
            } else {
                return MOVE_RES_REGULAR;
            }
        } else {
            return MOVE_RES_ILLEGAL;
        }
    }

    isClickSelfPiece(pos) {
        return this.pieces_[pos] && this.pieces_[pos].sidePlayer == this.curSidePlayer_;
    }

    getLastMove() {
        var mv = 0;
        var len = this.historyStepRecords_.length;
        if (len > 0) {
            mv = this.historyStepRecords_[len - 1].mv;
        }
        return mv;
    }

    backStep() {
        var mv = this.getLastMove();
        this.undoMove();
        this.changeSide();
        return mv;
    }
        
    // 显示棋子所有可行的落子位置
    prompt(pos) {
        var result = [];
        if (this.pieces_[pos] && this.pieces_[pos].sidePlayer == this.curSidePlayer_) {
            var mvs = this.generateMoves(this.pieces_[pos], false);
            for (var i = 0, len = mvs.length; i < len; ++i) {
                this.makeMove(mvs[i]);
                if (!this.willKillSelfKing())
                    result.push(mvs[i]);
                this.undoMove();
            }
        }
        return result;
    }

    play(mv) {
        this.makeMove(mv);
        this.changeSide();
    }
    playIccsMv(iccsMv) {
        var mv = iccs_move_to_move(iccsMv);
        this.play(mv);
    }

    toFen() {
        var fen = "";
        for (var row = 0; row < 10; ++row) {
            var number = 0;
            for (var col = 0; col < 9; ++col) {
                var pos = convert_to_pos(row, col);
                if (this.pieces_[pos] && this.pieces_[pos].show) {
                    if (number > 0) {
                        fen += number.toString();
                        number = 0;
                    }
                    var side = this.pieces_[pos].sidePlayer.side;
                    fen += PIECE_FEN_STRING[side][this.pieces_[pos].type];
                } else {
                    ++number;
                }
            }
            if (number > 0)
                fen += number.toString();

            fen += '/';
        }
        fen = fen.substr(0, fen.length - 1);
        fen += ' ';
        fen += (this.curSidePlayer_.side == SIDE_TYPE_RED ? 'w' : 'b');

        return fen;
    }

    // 返回打谱走法 炮二平五、马3进2 之类的
    toChineseMove(mv) {
        var res = "";

        var start = start_of_move(mv);
        var end = end_of_move(mv);

        var piece = this.pieces_[start];

        // 兵卒另外处理
        if (piece.type == PIECE_TYPE_PAWN) {
            var sameCols = 0;
            var curPos = 0;

            var line = new Array(9);
            line.fill(0);
            var pieces = piece.sidePlayer.pieces;
            for (var idx in pieces) {
                var p = pieces[idx];
                if (p != piece && p.type == piece.type && p.show) {
                    ++line[col_of_pos(p.pos)];
                    if (same_col(piece.pos, p.pos)) {
                        ++sameCols;
                        if (p.pos < piece.pos) {
                            ++curPos;
                        }
                    }
                }
            }
            var downSide = (0x80 & piece.sidePlayer.kingPiece.pos);
            // 同列上不止一个兵（卒）
            if (sameCols > 0) {
                var multiSameCol = false;
                for (var i = 0; i < 9; ++i) {
                    if (i != col_of_pos(piece.pos) && line[i] > 1) {
                        multiSameCol = true;
                        break;
                    }
                }
                curPos = (downSide ? curPos : sameCols - curPos);
                res += CHINESE_MOVE_PAWN_NUMBER[sameCols - 1][curPos];

                // 另外一路有两个兵或以上
                if (multiSameCol && !(sameCols == 2 && curPos == 1)) {
                    var col = (downSide ? 8 - col_of_pos(piece.pos) : col_of_pos(piece.pos));
                    res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][col];
                } else {
                    res += piece.name;
                }
            } else {
                res += piece.name; // 名字
                var col = (downSide ? 8 - col_of_pos(piece.pos) : col_of_pos(piece.pos));
                res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][col];
            }

            // 走法的起点和终点同行,否则同列
            if (same_row(piece.pos, end)) {
                res += "平";
                var col = (downSide ? 8 - col_of_pos(end) : col_of_pos(end));
                res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][col];
            } else {
                if (downSide)
                    res += (piece.pos > end ? "进" : "退");
                else
                    res += (piece.pos > end ? "退" : "进");
                var n = (Math.abs(piece.pos - end) >> 4) - 1;
                res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][n];
            }
            return res;
        }

        // 前两个字
        var sameTypePiece = null;
        var pieces = piece.sidePlayer.pieces;
        for (var idx in pieces) {
            var p = pieces[idx];
            if (p != piece && p.type == piece.type && p.show) {
                sameTypePiece = p;
                break;
            }
        }
        var downSide = (0x80 & piece.sidePlayer.kingPiece.pos);
        // 同类的子有两个并且在同一路上
        if (sameTypePiece && same_col(piece.pos, sameTypePiece.pos)) {
            if (downSide)
                res += (piece.pos > sameTypePiece.pos ? "后" : "前");
            else
                res += (piece.pos > sameTypePiece.pos ? "前" : "后");
            res += piece.name;
        } else {
            res += piece.name; // 名字
            var col = (downSide ? 8 - col_of_pos(piece.pos) : col_of_pos(piece.pos));
            res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][col];
        }

        // 后两个字

        // 士象马处理(只有进退)
        if (piece.type == PIECE_TYPE_ADVISOR ||
            piece.type == PIECE_TYPE_BISHOP ||
            piece.type == PIECE_TYPE_KNIGHT) {
            if (downSide)
                res += (piece.pos > end ? "进" : "退");
            else
                res += (piece.pos > end ? "退" : "进");

            var col = (downSide ? 8 - col_of_pos(end) : col_of_pos(end));
            res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][col];
        }
        // 車炮将(既有进退，又有平)
        else if (piece.type == PIECE_TYPE_ROOK ||
            piece.type == PIECE_TYPE_CANNON ||
            piece.type == PIECE_TYPE_KING) {
            // 走法的起点和终点同行,否则同列
            if (same_row(piece.pos, end)) {
                res += "平";
                var col = (downSide ? 8 - col_of_pos(end) : col_of_pos(end));
                res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][col];
            } else {
                if (downSide)
                    res += (piece.pos > end ? "进" : "退");
                else
                    res += (piece.pos > end ? "退" : "进");

                var n = (Math.abs(piece.pos - end) >> 4) - 1;
                res += CHINESE_MOVE_NUMBER[piece.sidePlayer.side][n];
            }
        }

        return res;
    }
}