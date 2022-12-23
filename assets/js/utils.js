// 是否在棋盘范围内
function in_board(pos)
{
	return array_in_borad[pos] != 0;
}

// 是否在九宫格内
function in_fort(pos)
{
	return array_in_fort[pos] != 0;
}

//是否在同一边
function same_half(a, b)
{
	return ((a ^ b) & 0x80) == 0;
}

// 是否在同一条直线上(列)
function same_col(a, b)
{
	return ((a ^ b) & 0x0f) == 0;
}

// 是否在同一条直线上(行)
function same_row(a, b)
{
	return ((a ^ b) & 0xf0) == 0;
}

// 根据两点是否同行或是同列计算偏移量,
// 如果不同行同列则返回零
function get_offset(a, b)
{
	if (same_row(a, b))
	{
		return (a > b ? -1 : 1); 
	}
	else if (same_col(a, b))
	{
		return (a > b ? -16 : 16);
	}
	else
	{
		return 0;
	}
}

function convert_to_pos(row, col)
{
	return ((row + 3) << 4) + (col + 3);
}

function col_of_pos(pos)
{
	return (pos & 0x0f) - 3;
}

function row_of_pos(pos)
{
	return (pos >> 4) - 3;
}

function mirror_pos(pos)
{
	return convert_to_pos(row_of_pos(pos), 8 - col_of_pos(pos));
}

function flip_pos(pos)
{
    return 254 - pos;
}

function start_of_move(mv)
{
	return (mv & 0xff);
}

function end_of_move(mv)
{
	return (mv >> 8);
}

function get_move(start, end)
{
	return (start | (end << 8));
}

function convert_reserse_move(mv)
{
	return get_move(end_of_move(mv), start_of_move(mv));
}

function convert_mirror_move(mv)
{
	return (mirror_pos(start_of_move(mv)) | (mirror_pos(end_of_move(mv)) << 8));
}

// iccs move
function iccs_pos_to_pos(iccs_col, iccs_row)
{
    var col = iccs_col.charCodeAt(0) - 'a'.charCodeAt(0);
    var row = 9 - (iccs_row.charCodeAt(0) - '0'.charCodeAt(0));
	return convert_to_pos(row, col);
}

function iccs_move_to_move(iccs_move)
{
	var start = iccs_pos_to_pos(iccs_move[0], iccs_move[1]);
	var end = iccs_pos_to_pos(iccs_move[2], iccs_move[3]);
	return get_move(start, end);
}

// 转换为Iccs（Internet Chinese Chess Server中国象棋互联网服务器）坐标
function pos_to_iccs_pos(iccs_pos, pos)
{
	var col = col_of_pos(pos);
	var row = row_of_pos(pos);

	return ICCS_MOVE_COL_HELPER[col] + ICCS_MOVE_ROW_HELPER[row];
}

function move_to_iccs_move(mv)
{
	return pos_to_iccs_pos(start_of_move(mv)) + pos_to_iccs_pos(end_of_move(mv));
}

// 快排
function quickSort(array, compareFunc) {
    if (array.length <= 1) {
        return array;
    }
    var pivotIndex = Math.floor(array.length / 2);
    var pivot = array.splice(pivotIndex, 1)[0]; //从数组中取出我们的"基准"元素
    var left = [];
    var right = [];
    array.forEach(item => {
        if (compareFunc(item, pivot) < 0) { //left 存放比 pivot 小的元素
            left.push(item);
        } else { //right 存放大于或等于 pivot 的元素
            right.push(item);
        }
    });
    //将数组分成了left和right两个部分
    return quickSort(left, compareFunc).concat(pivot, quickSort(right, compareFunc)); //分而治之
}