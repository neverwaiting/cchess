#!/bin/bash

LOG_DIR="./temp/"
BIN_DIR="./build/"

createLogDir()
{
	if [ ! -d $LOG_DIR ]; then
		mkdir $LOG_DIR
	fi
}

# 结束指定进程名称的进程
shutdownProc()
{
	result=`pidof $1`
	if [ $? -eq 0 ]; then
		kill -9 $result
	fi
}

# 关闭所有服务器
stopAllServer()
{
	shutdownProc "ws_connections_server" && \
	shutdownProc "center_server" && \
	shutdownProc "match_server" && \
	shutdownProc "login_server"
}

# 启动服务
startServer()
{
	cmd=$BIN_DIR$1
	${cmd} >> $LOG_DIR$1".log" 2>&1 &
}

# 启动所有服务
startAllServer()
{
	createLogDir
	startServer "login_server"
	startServer "match_server"
	startServer "center_server"
	startServer "ws_connections_server"
}

# 监控所有服务
monitorServer()
{
	cmd="top"
	for procname in "$@"
	do
		result=`pidof $procname`
		if [ $? -eq 0 ]; then
			cmd=$cmd" -p "$result
		fi
	done
	${cmd}
}

if [ $# -ne 1 ]; then
	echo "./startup.sh [start | stop | restart | monitor | clear]\n"
else
	if [ $1 = "start" ]; then
		startAllServer
	elif [ $1 = "stop" ]; then
		stopAllServer
	elif [ $1 = "restart" ]; then
		(stopAllServer && startAllServer)
	elif [ $1 = 'monitor' ]; then
		monitorServer "login_server" "match_server" "center_server" "ws_connections_server"
	elif [ $1 = 'clear' ]; then
		rm -rf $LOG_DIR
	else
		echo "not found cmd:" $1
	fi
fi
