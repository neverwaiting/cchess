#include "muduo/base/Logging.h"
#include "muduo/net/EventLoop.h"
#include "muduo/net/InetAddress.h"
#include "muduo/net/TcpServer.h"

#include "server_codec/codec.h"
#include "server_codec/dispatcher.h"
#include "cchess.pb.h"

using namespace muduo;
using namespace muduo::net;

namespace muduo
{
	const std::_Placeholder<4> _4 = std::placeholders::_4;
}

typedef std::shared_ptr<wsun::LoginRequest> LoginRequestPtr;
typedef std::shared_ptr<wsun::UpdateUserInfo> UpdateUserInfoPtr;

using ::wsun::UserInfo;

class LoginServer : noncopyable
{
public:
  LoginServer(EventLoop* loop, const InetAddress& listenAddr)
    : server_(loop, listenAddr, "LoginServer"),
			dispatcher_(std::bind(&LoginServer::onUnknownMessage, this, _1, _2, _3, _4)),
			codec_(std::bind(&ProtobufDispatcher::onProtobufMessage, &dispatcher_, _1, _2, _3, _4))
  {
		server_.setConnectionCallback(
				std::bind(&LoginServer::onConnection, this, _1));
		server_.setMessageCallback(
        std::bind(&ProtobufCodec::onMessage, &codec_, _1, _2, _3));
		dispatcher_.registerMessageCallback<wsun::LoginRequest>(
				std::bind(&LoginServer::onLoginRequest, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::UpdateUserInfo>(
				std::bind(&LoginServer::onUpdateUserInfo, this, _1, _2, _3, _4));
	}

	// 模拟数据
	void initDatabase()
	{
		char name[1024] = {0};
		const char* prefixName = "wintersun";
		UserInfo user;
		user.set_total(0);
		user.set_nwin(0);
		user.set_nloss(0);
		user.set_score(1000);
		for (int i = 0; i < 60000; ++i)
		{
			sprintf(name, "%s%d", prefixName, i);
			user.set_username(name);
			tempUsers_.insert(std::pair<std::string,UserInfo>(name, user));
		}
	}

	void start()
	{
		initDatabase();
		server_.start();
	}

	void onConnection(const TcpConnectionPtr& conn)
	{
		LOG_INFO << "connections reactive";
	}

  void onUnknownMessage(int id, const TcpConnectionPtr& conn,
                        const MessagePtr& message,
                        Timestamp)
  {
    LOG_INFO << "onUnknownMessage: connId=" << id << " " << message->GetTypeName();
    conn->shutdown();
  }

	UserInfo* vertifyUser(const std::string& username, const std::string& passwd)
	{
		UserInfo* user = nullptr;
		auto it = tempUsers_.find(username);
		if (it != tempUsers_.end() && passwd == "123456")
		{
			user = new UserInfo(it->second);
		}
		return user;
	}

	void onLoginRequest(int id, const TcpConnectionPtr& conn, const LoginRequestPtr& msg, Timestamp)
	{
		//LOG_INFO << "conn id=" << id << ", message_type: " << msg->GetTypeName();
		UserInfo* userInfo = vertifyUser(msg->username(), msg->passwd());
		if (userInfo)
		{
			::wsun::LoginSuccessResponse res;
			res.set_allocated_userinfo(userInfo);
			codec_.send(id, conn, res);
		}
		else
		{
			::wsun::LoginFailedResponse res;
			res.set_reason(::wsun::LoginFailedResponse::VERTIFY_ERROR);
			codec_.send(id, conn, res);
		}
	}

	void onUpdateUserInfo(int id, const TcpConnectionPtr& conn, const UpdateUserInfoPtr& msg, Timestamp)
	{
		auto it = tempUsers_.find(msg->info().username());
		if (it != tempUsers_.end())
			it->second.CopyFrom(msg->info());
	}

private:
	TcpServer server_;
	ProtobufDispatcher dispatcher_;
	ProtobufCodec codec_;

	std::map<std::string,UserInfo> tempUsers_;
};

int main(int argc, char** argv)
{
	EventLoop loop;
	LoginServer server(&loop, InetAddress(2020));
	server.start();
	loop.loop();
}
