var API_KEY//Enter you API key here

var ConnectionManager = function(socket){
    var STATUS_AVAILABLE = "available";
    var STATUS_UNAVAILABLE = "unavailable";

    var acisionSDK;
    var session;

    this.getAcision = function(){
        return acisionSDK;
    };

    /*
        Connects a user to acision sdk and registers for messages and audio calls
     */
    this.connect = function(username, password, authenticationSuccessCallback, messageReceivedCallback){
        acisionSDK = new AcisionSDK(API_KEY, {
            onConnected: function() {
                console.log("Authentication succeded");

                /*
                    Listening for audio call
                 */
                acisionSDK.webrtc.setCallbacks({
                    onIncomingSession: function(event) {
                        session = event.session;
                        session.remoteAudioElement = document.getElementById("audio-remote");
                        session.accept();
                    }
                });

                /*
                    Listening for incoming messages
                 */
                acisionSDK.messaging.setCallbacks({
                    onMessage: function(message){
                        messageReceivedCallback(message);
                    }
                });

                /*
                    Setting own state
                 */
                acisionSDK.presence.setOwnPresentity({
                    state: STATUS_AVAILABLE
                });

                socket.emit('newUser', {name: acisionSDK.getAddress()});
                authenticationSuccessCallback();
            },
            onAuthFailure: function() {
                console.warn("Authentication failed");
            }
        }, {
            username: username,
            password: password,
            persistent: true
        });
    };

    /*
        Gets presentities for users provided in parameter
        Starts listening to presentity updated (state change) for these users
     */
    this.getPresentitiesFor = function(userData, presentitiesSetCallback, presentitiesUpdatedCallback){
        acisionSDK.presence.getAllPresentities(userData, ["state"], {
            onSuccess: function(pre){
                /*
                 Listen to presentity updates for users
                 */
                acisionSDK.presence.subscribe(userData, ["state"], {
                    onSuccess: function(){
                        acisionSDK.presence.setCallbacks({
                            onPresentity: function(presentities){
                                presentitiesUpdatedCallback(presentities);
                            }
                        });
                        return presentitiesSetCallback(pre.reduce(toPresUser, []));

                        function toPresUser(result, presentity){
                            for(var i = 0; i < userData.length; i++){
                                if(presentity.user == userData[i]){
                                    result.push({
                                        name: userData[i].split('@')[0],
                                        address: userData[i],
                                        status: presentity.fields.state
                                    });
                                }
                            }

                            return result;
                        }
                    }
                });

            },
            onError: function(code, message){
                console.log(code, message);
                return null;
            }
        });
    };

    this.updateAvailability = function(value){
        acisionSDK.presence.setOwnPresentity({
            state: (value == STATUS_AVAILABLE)? STATUS_AVAILABLE : STATUS_UNAVAILABLE
        });
    };

    /*
        Sends messages to groups.
        Once messages are sent the group is deleted.
     */
    this.sendMessageToGroups = function(groups, message){
        if(!message || message.length == 0)
            return;

        acisionSDK.messaging.sendToGroup(groups, message, null, {
            onAcknowledged: function(){
                groups.forEach(function(group){
                    acisionSDK.contacts.deleteGroup(group);
                });
            },
            onError: function(code, message){
                groups.forEach(function(group){
                    acisionSDK.contacts.deleteGroup(group);
                });
            }
        });
    };


    /*
        Creates a temporary group with available users it it.
     */
    this.sendMessageToAvailableUsers = function(users, message){
        if(!message || message.length == 0)
            return;

        var availableUsers = users.filter(isAvailable)
            .map(toAddress);

        var group = "message";
        var self = this;

        acisionSDK.contacts.addToGroup(group, availableUsers, {
            onSuccess: function(){
                self.sendMessageToGroups([group], message);
            },
            onError: function(code, message){
                console.log('Group creation failed');
            }
        });

        function isAvailable(user){
            return user.status == STATUS_AVAILABLE;
        }

        function toAddress(user){
            return user.address;
        }

    };

    this.callUser = function(userAddress){
        if(session){
            session.close('normal');
            return session = undefined;
        }
        session = acisionSDK.webrtc.connect(userAddress);
        session.remoteAudioElement = document.getElementById("audio-remote");
    };
};





 