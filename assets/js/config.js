var config = {
    // 服务器地址
    address: "ws://127.0.0.1:8888",
    // ui部件
    uiDisplayer: null,
    net: null,
    cchess: null,
    // 红黑方
    side: 0,
    // 自己与对手的用户信息
    selfUser: null,
    oppUser: null,
    // 一些设置的控制开关
    switchBkMusic: false,
    switchSoundEffect: true,
    switchPrompt: true,
    switchAnimation: true,
    // 棋盘和棋子样式
    boardStyleIdx: 0,
    pieceStyleIdx: 0,
    boardStylePath: "img/board/",
    pieceStylePath: "img/pieces/",

    // 棋盘div id
    boardContainerId: "board",
    // 走法打谱表 div id
    stepRecordsContainerId: "stepRecords",
};
