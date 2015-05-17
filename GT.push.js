/**
 * 推送的主要接口
 */
var utils = require('./getui/utils');
var httpManager = require('./httpManager');
var ListMessage = require('./getui/message/ListMessage');
var AppMessage = require('./getui/message/AppMessage');

process.env.needDetails = false;

/**
 *
 * @param host required
 * @param appkey 第三方 标识 required
 * @param masterSecret 第三方 密钥 required
 * @constructor
 */
function GeTui(host, appkey, masterSecret) {
    if (!host || !appkey || !masterSecret) {
        throw new TypeError('required host, appkey and masterSecret');
    }
    this._host = host;
    this._appkey = appkey;
    this._masterSecret = masterSecret;
}

/**
 * 与服务其建立连接
 * connect to the server
 * @return true -- 连接成功 false -- 连接失败
 * 		   true -- connection sucessful false -- connection failure
 * @throws IOException
 *         出现任何连接异常
 *         For any IO Exceptions
 */
GeTui.prototype.connect = function(callback) {
    console.log('connect being invoked...');
    var timeStamp = new Date().getTime();
    // 计算sign值
    var sign = utils.md5(this._appkey + timeStamp + this._masterSecret); //必须按顺序
    var postData = {
        action: 'connect',
        appkey: this._appkey,
        timeStamp: timeStamp,
        sign: sign
    };
    httpManager.post(this._host, postData, function(err, data) {  //返回一个JSON格式的数据
        callback && callback(err, data && 'success' === data.result);
    });
};



/**
 * 关闭连接
 * disconnect to server
 * @throws IOException
 */
GeTui.prototype.close = function(callback) {
    var postData = {
        'action': 'close',
        'appkey': this._appkey
    };
    this.httpPostJson(this._host, postData, callback);
};

/**
 * 推送一条消息到某个客户端
 * push a message to a client appointed by target parameter
 * @param message
 *        消息
 * @param target
 *        目标用户
 *        target client
 * @return 推送结果
 * 		   push result
 */
GeTui.prototype.pushMessageToSingle = function(message, target, callback) {
    var postData = {
        'action': 'pushMessageToSingleAction',
        'appkey': this._appkey,

        //message
        'clientData': message.getData().getTransparent().toBase64(),
        'transmissionContent': message.getData().getTransmissionContent(),
        'isOffline': message.getOffline(),
        'offlineExpireTime': message.getOfflineExpireTime(),
        'pushType': message.getData().getPushType(),
        'pushNetWorkType': message.getPushNetWorkType(),

        //target
        'appId': target.getAppId(),
        'clientId': target.getClientId(),
        'alias': target.getAlias(),

        // 默认都为消息
        // Default as message
        'type': 2
    };
    this.httpPostJson(this._host, postData, callback);
};

GeTui.prototype.httpPostJson = function (host, postData, callback) {
    var _this = this;
    httpManager.post(host, postData, function (err, response) {
//        console.log(response);
        if (response.result === 'sign_error') {
            _this.connect(function (err, result) {
//                console.log(result);
                if (!!result) {
                    httpManager.post(host, postData, callback);
                } else {
                    console.log('connect failed still');
                }
            });
        } else {
            callback && callback(err, response);
        }
    });
};

/**
 * 批量推送前需要通过这个接口向服务器申请一个“ContentID”
 * @param message
 * @param taskGroupName 可为空
 * @param callback
 */
GeTui.prototype.getContentId = function(message, taskGroupName, callback) {
    var host = this._host;
    var postData = {
        action: 'getContentIdAction',
        appkey: this._appkey,
        clientData: message.getData().getTransparent().toBase64(),
        transmissionContent: message.getData().getTransmissionContent(),
        isOffline: message.getOffline(),
        offlineExpireTime: message.getOfflineExpireTime(),
        pushType: message.getData().getPushType(),
        type: 2,
        pushNetWorkType: message.getPushNetWorkType() // 增加pushNetWorkType参数(0:不限;1:wifi;2:4G/3G/2G)
    };
    if (typeof taskGroupName === 'function') {
        callback = taskGroupName;
        taskGroupName = null;
    }
    if(taskGroupName){
        postData.taskGroupName = taskGroupName;
    }
    if(message instanceof ListMessage) {
        postData.contentType = 1;
    } else if(message instanceof AppMessage){
        postData.contentType = 2;
        postData.appIdList = message.getAppIdList();
        postData.phoneTypeList = message.getPhoneTypeList();
        postData.provinceList = message.getProvinceList();
        postData.tagList = message.getTagList();
        postData.speed = message.getSpeed();
    }
    this.httpPostJson(this._host, postData, function(err, response) {
        if (!err && response.result === 'ok' && response.contentId) {
            callback && callback(null, response.contentId);
        } else {
            callback && callback(new Error('host:[' + host + ']' + '获取contentId失败'), response);
        }
    });

};

/**
 * 根据contentId取消上传的消息体
 *
 * @param contentId contentId
 * @param callback
 * @return boolean 返回是否成功
 */
GeTui.prototype.cancelContentId = function(contentId, callback) {
    var host = this._host;
    var postData = {
        action: 'cancleContentIdAction',
        appkey: this._appkey,
        contentId: contentId
    };
    this.httpPostJson(this._host, postData, function(err, response) {
        if (!err && 'ok' === response.result) {
            callback && callback(null, true);
        } else {
            callback && callback(new Error('host:[' + host + ']' + '取消contentId失败'), false);
        }
    });

};

/**
 * 停止某次任务，以ContentID作为标识
 *
 * 通过这个方法，可以取消正在发送中的某次任务，
 * 服务器会抛弃所有正在推送中该任务的所有消息，
 * 以及这个任务相关的离线消息，但是已经下发到
 * 手机的消息就无法再收回了。
 *
 * @param contentId 内容ID
 * @return 是否成功停止
 */
GeTui.prototype.stop = function(contentId, callback) {
    var host = this._host;
    var postData = {
        action: 'stopTaskAction',
        appkey: this._appkey,
        contentId: contentId
    };
    this.httpPostJson(this._host, postData, function(err, response) {
        if (!err && 'ok' === response.result) {
            callback && callback(null, true);
        } else {
            callback && callback(new Error('host:[' + host + ']' + '取消任务失败'), false);
        }
    });
};

/**
 * 通过{@link IIGtPush.getContentId(ListMessage message)}接口 获得“ContentID”后，通过这个方法实现批量推送。
 *
 * @param contentId
 *        {@link IIGtPush.getContentId(ListMessage message)}接口返回的ID
 * @param targetList
 *        目标用户列表
 * @param callback
 * @return
 */
GeTui.prototype.pushMessageToList = function(contentId, targetList, callback) {
    var postData = {
        action: 'pushMessageToListAction',
        appkey: this._appkey,
        targetList: targetList,
        contentId: contentId,
        type: 2,
        needDetails: process.env.needDetails === 'true'
    };
    this.httpPostJson(this._host, postData, callback);
};

/**
 * 推送消息到条件限定的用户，限定条件由AppMessage中的参数控制， 如果没有任何限定条件，将会此App的对所有用户进行推送
 *
 * @param message
 *        推送消息
 * @param taskGroupName
 *
 * @param callback
 * @return
 */
GeTui.prototype.pushMessageToApp = function(message, taskGroupName, callback) {
    var host = this._host;
    var appkey = this._appkey;
    if (typeof taskGroupName === 'function') {
        callback = taskGroupName;
        taskGroupName = null;
    }
    var _this = this;
    this.getContentId(message, taskGroupName, function(err, contentId) {
        if (!err) {
            var postData = {
                action: 'pushMessageToAppAction',
                appkey: appkey,
                type: 2,
                contentId: contentId
            };
            _this.httpPostJson(_this._host, postData, callback);
        }
    });
};
/**
 *
 * @param appId
 * @param deviceToken
 * @param message
 * @param callback
 */
GeTui.prototype.pushAPNMessageToSingle = function(appId, deviceToken, message, callback) {
    if (deviceToken.length !== 64) {
        throw new TypeError('deviceToken length must be 64');
    }
    var postData = {
        action: 'apnPushToSingleAction',
        appId: appId,
        appkey: this._appkey,
        DT: deviceToken,
        PI: message.getData().getPushInfo().toBase64()
    };
    this.httpPostJson(this._host, postData, callback);
};

GeTui.prototype.pushAPNMessageToList = function(appId, contentId, deviceTokenList, callback) {
    deviceTokenList.forEach(function(deviceToken) {
        if (deviceToken.length !== 64) {
            throw new TypeError('deviceToken length must be 64');
        }
    });

    var postData = {
        action: 'apnPushToListAction',
        appId: appId,
        appkey: this._appkey,
        contentId: contentId,
        DTL: deviceTokenList,
        needDetails: process.env.needDetails === 'true'
    };
    this.httpPostJson(this._host, postData, callback);
};

GeTui.prototype.getAPNContentId = function(appId, message, callback) {
    var host = this._host;
    var postData = {
        action: 'apnGetContentIdAction',
        appkey: this._appkey,
        appId: appId,
        PI: message.getData().getPushInfo().toBase64()
    };
    this.httpPostJson(this._host, postData, function(err, response) {
        if (!err && response.result === 'ok' && response.contentId) {
            callback && callback(null, response.contentId);
        } else {
            callback && callback(new Error('host:[' + host + '] 获取contentId失败:' + response.result));
        }
    });

};

GeTui.prototype.getClientIdStatus = function(appId, clientId, callback) {
    var postData = {
        action: 'getClientIdStatusAction',
        appkey: this._appkey,
        appId: appId,
        clientId: clientId
    };
    this.httpPostJson(this._host, postData, callback);
};

GeTui.prototype.setClientTag = function(appId, clientId, tags, callback) {
    var postData = {
        action: 'setTagAction',
        appkey: this._appkey,
        appId: appId,
        clientId: clientId,
        tagList: tags
    };
    this.httpPostJson(this._host, postData, callback);
};
/**
 * 绑定别名 或bindAlias(appId, targetList, callback)
 * @param appId
 * @param alias string or targetList array
 * @param clientId  如果是 alias, clientId为空
 * @param callback
 */
GeTui.prototype.bindAlias = function(appId, alias, clientId, callback) {
    var postData = {
        appkey: this._appkey,
        appid: appId
    };
    if (typeof alias === 'string') {
        postData.action = 'alias_bind';
        postData.alias = alias;
        postData.cid = clientId;
    } else {
        var targetList = alias;
        if (typeof clientId === 'function') {
            callback = clientId;
        }
        var aliaslist = [];
        targetList.forEach(function(target) {
            aliaslist.push({cid: target.getClientId(), alias: target.getAlias()});
        });
        postData.aliaslist = aliaslist;
        postData.action = 'alias_bind_list';
    }
    this.httpPostJson(this._host, postData, callback);
};

GeTui.prototype.queryClientId = function(appId, alias, callback) {
    var postData = {
        action: 'alias_query',
        appkey: this._appkey,
        appid: appId,
        alias: alias
    };
    this.httpPostJson(this._host, postData, callback);
};

GeTui.prototype.queryAlias = function(appId, clientId, callback) {
    var postData = {
        action: 'alias_query',
        appkey: this._appkey,
        appid: appId,
        cid: clientId
    };
    this.httpPostJson(this._host, postData, callback);
};
/**
 * 取消别名绑定
 * @param appId
 * @param alias
 * @param clientId  如果取消全部，clientId 为空
 * @param callback
 */
GeTui.prototype.unBindAlias = function(appId, alias, clientId, callback) {
    var postData = {
        action: 'alias_unbind',
        appkey: this._appkey,
        appid: appId,
        alias: alias
    };
    if (typeof clientId === 'string' && clientId.length > 0) {
        postData.cid = clientId;
    } else if (typeof clientId === 'function') {
        callback = clientId;
    }
    this.httpPostJson(this._host, postData, callback);
};
/**
 * 获取推送结果
 * @param taskId  任务id
 * @param callback
 */
GeTui.prototype.getPushMsgResult = function(taskId, callback) {
  var str = this._masterSecret + 'action' + 'getPushMsgResult' + 'appkey' + this._appkey + 'taskId' + taskId;
  var sign = utils.md5(str);
  var postData = {
    action: 'getPushMsgResult',
    appkey: this._appkey,
    taskId: taskId,
    sign: sign
  };
  this.httpPostJson(this._host, postData, callback);
};

module.exports = GeTui;