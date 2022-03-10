# chinese chess project

## 项目演示
* 视频链接：[https://www.bilibili.com/video/BV1Ma411h7NM?share_source=copy_web](https://www.bilibili.com/video/BV1Ma411h7NM?share_source=copy_web)
* 网站访问：[http://cchess.nstop.cn](http://cchess.nstop.cn) 用户名：`wintersun0 ~ wintersun59999` 密码：`123456`
## 简介
* 这是一个网页版本的多人在线匹配游戏的中国象棋。
* 客户端用html+css+原生js设计的，没有使用任何框架。
* 服务端用的c++，基于muduo网络库实现的。
* 附带一个简单的测压程序，在局域网内部添加任意数量的机器人，机器人随机登录、匹配、走棋、重新连接等等。

## 如何使用

### 构建环境
* 在构建之前必须安装google protobuf 和 muduo 网络库 以及 zlib、cmake。

### 客户端部署
* assert文件下都是前端静态资源文件。
* 您可以使用nginx简单部署这个静态网页。
* 注意！根据您的实际情况改写`assert/js/config.js`文件中的服务器地址。

### 服务端部署
* 编译源文件
```shell
mkdir build && cd build && cmake .. && make
```
* 编译成功后可以使用`startup.sh start`来启动所有服务。
* startup.sh 可以跟以下参数
1. start 启动所有服务
2. stop 暂停所有服务
3. monitor 查看所有服务的负载情况
4. clear 清空日志文件
* 服务器默认端口是8888，可以根据自己的实际情况进行改写。

## 服务器实现基本思路
* 总的分为4个服务模块，login_server、match_server、center_server、ws_connections_server
* login_server: 负责查询和修改用户信息，内部存了60000个用户数据，没有用数据库，都是在内存中，用户名为winersun0 ~ wintersun59999。
* match_server：负责将位于匹配队列的用户两两配对，返回给center_server。匹配实现很简单，用了两个优先级队列，一个快棋模式quickly_pattern,一个慢棋模式slowly_pattern。
* center_server：负责处理login_server、match_server和ws_connnections_server收发的消息，如对局创建、对局销毁、用户悔棋、和棋、认输、走棋、匹配、登录请求处理。
* ws_connections_server: 负责接收客户端连接，并且为每个客户端分配一个唯一的connId，转发client和center_server之间的数据，作用类似于proxy_server。
* 用protobuf作为数据协议格式，用websocket作为客户端与ws_connections_server的网络协议。
