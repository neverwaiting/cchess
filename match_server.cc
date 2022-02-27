#include "muduo/base/Logging.h"
#include "muduo/net/EventLoop.h"
#include "muduo/net/InetAddress.h"
#include "muduo/net/TcpServer.h"
#include <muduo/base/Thread.h>
#include <muduo/base/Mutex.h>
#include <condition_variable>
#include <mutex>

#include <queue>

#include "server_codec/codec.h"
#include "server_codec/dispatcher.h"
#include "cchess.pb.h"

using namespace muduo;
using namespace muduo::net;

using ::wsun::RoomType;
using ::wsun::UserMatchInfo;

namespace muduo
{
	const std::_Placeholder<4> _4 = std::placeholders::_4;
}

typedef std::shared_ptr<::wsun::UserMatchInfo> UserMatchInfoPtr;
typedef std::shared_ptr<::wsun::MatchBackendRequest> MatchBackendRequestPtr;
typedef std::shared_ptr<::wsun::CancelMatchBackendRequest> CancelMatchBackendRequestPtr;

struct CmpUserMatchInfo
{
	bool operator()(const UserMatchInfoPtr& left, const UserMatchInfoPtr& right)
	{
		return right->score() < left->score();
	}
};

// thread safe
class SafeMatchQueue
{
public:
	typedef std::priority_queue<UserMatchInfoPtr, std::vector<UserMatchInfoPtr>, CmpUserMatchInfo> InnerQueue;
	
	void pop(UserMatchInfoPtr& user1, UserMatchInfoPtr& user2)
	{
		std::unique_lock<std::mutex> lock(mut_);
		cond_.wait(lock, [this](){ return queue_.size() >= 2; });

		user1 = queue_.top();
		queue_.pop();
		user2 = queue_.top();
		queue_.pop();
	}

	void push(const UserMatchInfoPtr& user)
	{
		{
			std::lock_guard<std::mutex> lock(mut_);
			queue_.push(user);
		}
		cond_.notify_one();
	}
	
private:
	std::mutex mut_;
	std::condition_variable cond_;
	InnerQueue queue_;
};

class MatchServer : noncopyable
{
public:

  MatchServer(EventLoop* loop, const InetAddress& listenAddr)
    : server_(loop, listenAddr, "MatchServer"),
			dispatcher_(std::bind(&MatchServer::onUnknownMessage, this, _1, _2, _3, _4)),
			codec_(std::bind(&ProtobufDispatcher::onProtobufMessage, &dispatcher_, _1, _2, _3, _4)),
			quicklyPatternThread_(std::bind(&MatchServer::theadRoutine, this, RoomType::QUICKLY_PATTERN)),
			slowlyPatternThread_(std::bind(&MatchServer::theadRoutine, this, RoomType::SLOWLY_PATTERN))
  {
		server_.setConnectionCallback(
				std::bind(&MatchServer::onConnection, this, _1));
		server_.setMessageCallback(
        std::bind(&ProtobufCodec::onMessage, &codec_, _1, _2, _3));

		dispatcher_.registerMessageCallback<wsun::MatchBackendRequest>(
				std::bind(&MatchServer::onMatchRequest, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::CancelMatchBackendRequest>(
				std::bind(&MatchServer::onCancelMatchRequest, this, _1, _2, _3, _4));
	}

	void theadRoutine(RoomType type)
	{
		UserMatchInfoPtr user1;
		UserMatchInfoPtr user2;
		SafeMatchQueue* matchQueue = 
			type == RoomType::QUICKLY_PATTERN ? &quicklyMatchQueue_ : &slowlyMatchQueue_;
		for(;;)
		{
			matchQueue->pop(user1, user2);

			if (!user1.unique() && !user2.unique() &&
					user1->type() == type &&
					user2->type() == type)
			{
				::wsun::MatchBackendResponse res;
				res.set_type(type);
				// 匹配先手原则
				bool user1IsRed = (user1->score() - user2->score() / 10) % 2 == 0;
				std::string redUsername = user1IsRed ? user1->username() : user2->username();
				std::string blackUsername = user1IsRed ? user2->username() : user1->username();

				res.set_redusername(redUsername);
				res.set_blackusername(blackUsername);
				codec_.send(0, conn_, res);

				// erase from userList
				std::lock_guard<std::mutex> lock(mut_);
				matchUserList_.erase(user1->username());
				matchUserList_.erase(user2->username());
			}
			else
			{
				if (!user1.unique() && user1->type() == type)
				{
					matchQueue->push(user1);
				}
				if (!user2.unique() && user2->type() == type)
				{
					matchQueue->push(user2);
				}
			}
			user1.reset();
			user2.reset();
		}
	}
	void start()
	{
		quicklyPatternThread_.start();
		slowlyPatternThread_.start();
		server_.start();
	}

	void onConnection(const TcpConnectionPtr& conn)
	{
		if (conn->connected())
		{
			if (conn_) conn->shutdown();
			else conn_ = conn;
		}
		else
		{
			conn_.reset();
		}
	}

  void onUnknownMessage(int id, const TcpConnectionPtr& conn,
                        const MessagePtr& message,
                        Timestamp)
  {
    LOG_INFO << "onUnknownMessage: connId=" << id << " " << message->GetTypeName();
    conn->shutdown();
  }

	void onMatchRequest(int id, const TcpConnectionPtr& conn, const MatchBackendRequestPtr& msg, Timestamp)
	{
		const std::string& name = msg->info().username();
		UserMatchInfoPtr user;
		{
			std::lock_guard<std::mutex> lock(mut_);
			auto it = matchUserList_.find(name);
			if (it == matchUserList_.end())
			{
				user.reset(new UserMatchInfo);
				user->CopyFrom(msg->info());
				matchUserList_.insert(std::make_pair(name, user));
			}
		}
		if (user)
		{
			if (msg->info().type() == RoomType::QUICKLY_PATTERN)
				quicklyMatchQueue_.push(user);
			else
				slowlyMatchQueue_.push(user);
		}
	}

	void onCancelMatchRequest(int id, const TcpConnectionPtr& conn, const CancelMatchBackendRequestPtr& msg, Timestamp)
	{
		std::lock_guard<std::mutex> lock(mut_);
		matchUserList_.erase(msg->username());
	}

private:
	TcpServer server_;
	ProtobufDispatcher dispatcher_;
	ProtobufCodec codec_;

	SafeMatchQueue quicklyMatchQueue_;
	SafeMatchQueue slowlyMatchQueue_;
	Thread quicklyPatternThread_;
	Thread slowlyPatternThread_;
	
	std::mutex mut_;
	std::map<std::string,UserMatchInfoPtr> matchUserList_;
	
	TcpConnectionPtr conn_;
};

int main(int argc, char** argv)
{
	EventLoop loop;
	MatchServer server(&loop, InetAddress(2021));
	server.start();
	loop.loop();
}
