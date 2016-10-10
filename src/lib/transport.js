/**
 * @fileOverview Transport
 */
define([
    '../base',
    '../runtime/client',
    '../mediator'
], function( Base, RuntimeClient, Mediator ) {

    var $ = Base.$;

    function Transport( opts ) {
        var me = this;

        opts = me.options = $.extend( true, {}, Transport.options, opts || {} );
        RuntimeClient.call( this, 'Transport' );

        this._blob = null;
        this._formData = opts.formData || {};
        this._headers = opts.headers || {};

        this.on( 'progress', this._timeout );
        this.on( 'load error', function() {
            me.trigger( 'progress', 1 );
            clearTimeout( me._timer );
        });
    }

    Transport.options = {
        server: '',
        // 阿里云OSS直传授权接口
        ossPostPolicyServer: 'http://www.yitong.com/apis/aliyun-oss-file-service/v1/oss/post-policy.jsonp',
        method: 'POST',

        // 跨域时，是否允许携带cookie, 只有html5 runtime才有效
        withCredentials: false,
        fileVal: 'file',
        timeout: 2 * 60 * 1000,    // 2分钟
        formData: {},
        headers: {},
        sendAsBinary: false
    };

    $.extend( Transport.prototype, {

        // 添加Blob, 只能添加一次，最后一次有效。
        appendBlob: function( key, blob, filename ) {
            var me = this,
                opts = me.options;

            if ( me.getRuid() ) {
                me.disconnectRuntime();
            }

            // 连接到blob归属的同一个runtime.
            me.connectRuntime( blob.ruid, function() {
                me.exec('init');
            });

            me._blob = blob;
            opts.fileVal = key || opts.fileVal;
            opts.filename = filename || opts.filename;
        },

        // 添加其他字段
        append: function( key, value ) {
            if ( typeof key === 'object' ) {
                $.extend( this._formData, key );
            } else {
                this._formData[ key ] = value;
            }
        },

        setRequestHeader: function( key, value ) {
            if ( typeof key === 'object' ) {
                $.extend( this._headers, key );
            } else {
                this._headers[ key ] = value;
            }
        },

        send: function( method ) {
            // this.exec( 'send', method );
            // this._timeout();
            // 上传前先获取阿里云OSS授权，考虑兼容性，使用jsonp
            var me = this,
                opts = me.options;
        
            var object = '/' + opts.filename;
            var callback = 'webuploader_callback_' + new Date().getTime();
            window[callback] = function(ossPostPolicy) {
                me._ossPostPolicy = ossPostPolicy;
                me.options.server = ossPostPolicy.server;
                me._formData[ 'OSSAccessKeyId' ] = ossPostPolicy[ 'OSSAccessKeyId' ];
                me._formData[ 'policy' ] = ossPostPolicy[ 'policy' ];
                me._formData[ 'Signature' ] = ossPostPolicy[ 'Signature' ];
                me._formData[ 'key' ] = ossPostPolicy[ 'key' ];
                me._formData[ 'success_action_status' ] = ossPostPolicy[ 'success_action_status' ];
                me.exec( 'send', method );
                me._timeout();

                try {
                    window[callback] = undefined;
                    delete window[callback];
                } catch(e) {
                }
            };

            var script = document.createElement('script');
            script.src = opts.ossPostPolicyServer + '?callback=' + callback + '&object=' + encodeURIComponent(object);
            document.body.appendChild(script);
        },

        abort: function() {
            clearTimeout( this._timer );
            return this.exec('abort');
        },

        destroy: function() {
            this.trigger('destroy');
            this.off();
            this.exec('destroy');
            this.disconnectRuntime();
        },

        getResponse: function() {
            // return this.exec('getResponse');
            // 统一getResponse与getResponseAsJson结果
            var response = this.getResponseAsJson();
            if (window.JSON) {
                return JSON.stringify(response);
            }
            // 兼容
            var keyValues = [];
            for (var key in response) {
                var value = response[key];
                if (typeof value == "number") {
                    keyValues.push('"' + key + '":' + value);
                } else {
                    keyValues.push('"' + key + '":"' + value + '"');
                }
            }
            return '{' + keyValues.join(',') + '}';
        },

        getResponseAsJson: function() {
            // return this.exec('getResponseAsJson');
            // 阿里云OSS 200状态码返回值为空，使用授权接口信息
            return {
                name: this._formData.name,
                size: this._formData.size,
                type: this._formData.type,
                lastModifiedDate: this._formData.lastModifiedDate,
                id: this._formData.id,
                state: 'SUCCESS',
                url: this._ossPostPolicy.url
            };
        },

        getStatus: function() {
            return this.exec('getStatus');
        },

        _timeout: function() {
            var me = this,
                duration = me.options.timeout;

            if ( !duration ) {
                return;
            }

            clearTimeout( me._timer );
            me._timer = setTimeout(function() {
                me.abort();
                me.trigger( 'error', 'timeout' );
            }, duration );
        }

    });

    // 让Transport具备事件功能。
    Mediator.installTo( Transport.prototype );

    return Transport;
});