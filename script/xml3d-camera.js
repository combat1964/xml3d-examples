(function() {
    /*************************************************************************/
    /*                                                                       */
    /*  camera.js                                                            */
    /*  Simple navigation for XML3D scenes                                   */
    /*                                                                       */
    /*  Copyright (C) 2015                                                   */
    /*  DFKI - German Research Center for Artificial Intelligence            */
    /*                                                                       */
    /*  xml3d.js is free software; you can redistribute it and/or modify     */
    /*  under the terms of the GNU General Public License as                 */
    /*  published by the Free Software Foundation; either version 2 of       */
    /*  the License, or (at your option) any later version.                  */
    /*                                                                       */
    /*  xml3d.js is distributed in the hope that it will be useful, but      */
    /*  WITHOUT ANY WARRANTY; without even the implied warranty of           */
    /*  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.                 */
    /*  See the GNU General Public License                                   */
    /*  (http://www.fsf.org/licensing/licenses/gpl.html) for more details.   */
    /*                                                                       */
    /*************************************************************************/

    //Check, if basics have already been defined
    if(!XML3D)
        XML3D = {};
    if(!XML3D.util)
        XML3D.util = {};

    XML3D.util.Timer = function() {
        this.start();
    };

    XML3D.util.Timer.prototype.restart = function() {
        var prevTime = this.time;
        this.start();
        return this.time - prevTime;
    };

    XML3D.util.Timer.prototype.start = function() {
        this.time = new Date().getTime();
    };

    XML3D.StandardCamera = function(viewElement, opt) {
        if (!viewElement) {
            throw("Must provide a view element when initializing the StandardCamera!");
        }
        if (viewElement.hasAttribute("style")) {
            XML3D.debug.logWarning("This camera controller does not support CSS transforms, unexpected things may happen! Try using a <transform> element instead.");
        }
        opt = opt || {};
        this.view = viewElement;
        this.xml3d = this.getXML3DForView(viewElement);

        this.mode = opt.mode || "examine";
        this.touchTranslateMode = opt.touchTranslateMode || "twofinger";
        //Note: The revolve point is relative to the view element's parent coordinate space.
        this.revolveAroundPoint = opt.revolveAroundPoint || XML3D.Vec3.fromValues(0, 0, 0);
        this.rotateSpeed = opt.rotateSpeed || 3;
        this.zoomSpeed = opt.zoomSpeed || 20;
        this.useKeys = opt.useKeys !== undefined ? opt.useKeys : false;

        this.viewInterface = new ViewInterface(this.view, this.xml3d);
        this.timer = new XML3D.util.Timer();
        this.prevPos = {x: -1, y: -1};
        this.prevTouchPositions = [];
        this.prevTouchPositions[0] = {
            x : -1,
            y : -1
        };
        this.prevZoomVectorLength = null;
        this.upVector = this.viewInterface.upVector;

        this.attach();
    };

    XML3D.StandardCamera.prototype.setRevolvePoint = function(vec) {
        this.revolveAroundPoint = vec;
    };

    XML3D.StandardCamera.prototype.attach = function() {
        var self = this;
        this._evt_mousedown = function(e) {self.mousePressEvent(e);};
        this._evt_mouseup = function(e) {self.mouseReleaseEvent(e);};
        this._evt_mousemove = function(e) {self.mouseMoveEvent(e);};
        this._evt_contextmenu = function(e) {self.stopEvent(e);};
        this._evt_keydown = function(e) {self.keyHandling(e);};

        this._evt_touchstart = function(e) {self.touchStartEvent(e);};
        this._evt_touchmove = function(e) {self.touchMoveEvent(e);};
        this._evt_touchend = function(e) {self.touchEndEvent(e);};
        this._evt_touchcancel = function(e) {self.touchEndEvent(e);};


        this.xml3d.addEventListener("mousedown", this._evt_mousedown, false);
        document.addEventListener("mouseup", this._evt_mouseup, false);
        document.addEventListener("mousemove",this._evt_mousemove, false);

        this.xml3d.addEventListener("touchstart", this._evt_touchstart, false);
        document.addEventListener("touchend", this._evt_touchend, false);
        document.addEventListener("touchmove",this._evt_touchmove, false);
        document.addEventListener("touchcancel", this._evt_touchend, false);

        this.xml3d.addEventListener("contextmenu", this._evt_contextmenu, false);
        if (this.useKeys)
            document.addEventListener("keydown", this._evt_keydown, false);
    };

    XML3D.StandardCamera.prototype.detach = function() {
        this.xml3d.removeEventListener("mousedown", this._evt_mousedown, false);
        document.removeEventListener("mouseup", this._evt_mouseup, false);
        document.removeEventListener("mousemove",this._evt_mousemove, false);

        this.xml3d.removeEventListener("touchstart", this._evt_touchstart, false);
        document.removeEventListener("touchend", this._evt_touchend, false);
        document.removeEventListener("touchmove",this._evt_touchmove, false);
        document.removeEventListener("touchcancel", this._evt_touchend, false);

        this.xml3d.removeEventListener("contextmenu", this._evt_contextmenu, false);
        if (this.useKeys)
            document.removeEventListener("keydown", this._evt_keydown, false);
    };

    XML3D.StandardCamera.prototype.__defineGetter__("width", function() { return this.xml3d.width;});
    XML3D.StandardCamera.prototype.__defineGetter__("height", function() { return this.xml3d.height;});

    XML3D.StandardCamera.prototype.getXML3DForView = function(view) {
        var node = view.parentNode;
        while (node && node.localName !== "xml3d") {
            node = node.parentNode;
        }
        if (!node) {
            throw("Could not find XML3D element for the given view.");
        }
        return node;
    };

    XML3D.StandardCamera.prototype.stopEvent = function(ev) {
        if (ev.preventDefault)
            ev.preventDefault();
        if (ev.stopPropagation)
            ev.stopPropagation();
        ev.returnValue = false;
    };

    XML3D.StandardCamera.prototype.NO_MOUSE_ACTION = 0;
    XML3D.StandardCamera.prototype.TRANSLATE = 1;
    XML3D.StandardCamera.prototype.DOLLY = 2;
    XML3D.StandardCamera.prototype.ROTATE = 3;
    XML3D.StandardCamera.prototype.LOOKAROUND = 4;

    XML3D.StandardCamera.prototype.mousePressEvent = function(event) {

        var ev = event || window.event;

        switch (ev.button) {
            case 0:
                if(this.mode == "examine")
                    this.action = this.ROTATE;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 1:
                this.action = this.TRANSLATE;
                break;
            case 2:
                this.action = this.DOLLY;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        this.prevPos.x = ev.pageX;
        this.prevPos.y = ev.pageY;

        if (this.action !== this.NO_MOUSE_ACTION) {
            //Disable object picking during camera actions
            XML3D.options.setValue("renderer-mousemove-picking", false);
        }

        this.stopEvent(event);
        return false;
    };

    XML3D.StandardCamera.prototype.mouseReleaseEvent = function(event) {
        this.stopEvent(event);

        if (this.action !== this.NO_MOUSE_ACTION) {
            XML3D.options.setValue("renderer-mousemove-picking", true);
        }

        this.action = this.NO_MOUSE_ACTION;
        return false;
    };

    XML3D.StandardCamera.prototype.computeMouseSpeed = function(event) {
        var dx = (event.pageX - this.prevPos.x);
        var dy = (event.pageY - this.prevPos.y);
        var dist = Math.sqrt(+dx*dx + dy*+dy);
        this.delay = this.timer.restart();
        if (this.delay == 0)
            this.mouseSpeed = dist;
        else
            this.mouseSpeed = dist/this.delay;
        XML3D.debug.logWarning("Mouse speed: " + this.mouseSpeed);
    };

    XML3D.StandardCamera.prototype.mouseMoveEvent = function(event, camera) {
        var ev = event || window.event;
        if (!this.action)
            return;
        switch(this.action) {
            case(this.TRANSLATE):
                var f = 2.0* Math.tan(this.viewInterface.fieldOfView/2.0) / this.height;
                var dx = f*(ev.pageX - this.prevPos.x) * this.zoomSpeed;
                var dy = f*(ev.pageY - this.prevPos.y) * this.zoomSpeed;
                var trans = XML3D.Vec3.fromValues(-dx, dy, 0.0);
                this.viewInterface.translate(this.viewInterface.inverseTransformOf(trans));
                break;
            case(this.DOLLY):
                var dy = this.zoomSpeed * (ev.pageY - this.prevPos.y) / this.height;
                this.viewInterface.translate(this.viewInterface.inverseTransformOf(XML3D.Vec3.fromValues(0, 0, dy)));
                break;
            case(this.ROTATE):

                var dx = -this.rotateSpeed*0.1 * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
                var dy = -this.rotateSpeed*0.1 * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;

                var mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
                var my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
                mx = mx.mul(my);
                this.viewInterface.rotateAroundPoint(mx, this.revolveAroundPoint);
                break;
            case(this.LOOKAROUND):
                var dx = -this.rotateSpeed*0.1 * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
                var dy = this.rotateSpeed*0.1 * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;
                var cross = this.upVector.cross(this.viewInterface.direction);

                var mx = XML3D.Quat.fromAxisAngle( this.upVector , dx);
                var my = XML3D.Quat.fromAxisAngle( cross , dy);

                this.viewInterface.lookAround(mx, my, this.upVector);
                break;
        }

        if (this.action != this.NO_MOUSE_ACTION)
        {
            this.prevPos.x = ev.pageX;
            this.prevPos.y = ev.pageY;
            event.returnValue = false;
        }
        this.stopEvent(event);
        return false;
    };


    // -----------------------------------------------------
    // touch rotation and movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.touchStartEvent = function(event) {
        if (event.target.nodeName.toLowerCase() == "xml3d") {
            this.stopEvent(event);
        }

        var ev = event || window.event;
        switch (ev.touches.length) {
            case 1:
                if(this.mode == "examine")
                    this.action = this.ROTATE;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 2:
                this.action = this.DOLLY;
                break;
            case 3:
                this.action = this.TRANSLATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++) {
            touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        }
        this.prevTouchPositions = touchPositions;

        return false;
    };

    XML3D.StandardCamera.prototype.touchEndEvent = function(event) {
        if (event.target.nodeName.toLowerCase() == "xml3d") {
            this.stopEvent(event);
        }

        var ev = event || window.event;
        switch (ev.touches.length) {
            case 1:
                this.prevZoomVectorLength = null;
                if(this.mode == "examine")
                    this.action = this.ROTATE;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 2:
                this.action = this.DOLLY;
                break;
            case 3:
                this.action = this.TRANSLATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++) {
            touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        }
        this.prevTouchPositions = touchPositions;

        return false;
    };

    XML3D.StandardCamera.prototype.touchMoveEvent = function(event, camera) {
        if (event.target.nodeName.toLowerCase() == "xml3d") {
            this.stopEvent(event);
        }

        var ev = event || window.event;
        if (!this.action)
            return;

        switch(this.action) {
            case(this.TRANSLATE):
                if (this.touchTranslateMode == "threefinger") {
                    var f = 2.0* Math.tan(this.viewInterface.fieldOfView/2.0) / this.height;
                    var dx = f*(ev.touches[0].pageX - this.prevTouchPositions[0].x);
                    var dy = f*(ev.touches[0].pageY - this.prevTouchPositions[0].y);
                    var trans = XML3D.Vec3.fromValues(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                    this.viewInterface.translate(this.viewInterface.inverseTransformOf(trans));
                }
                break;
            case(this.DOLLY):
                if (this.touchTranslateMode == "twofinger") {
                    //apple-style 2-finger dolly + translate
                    var prevMidpoint;

                    if (this.prevTouchPositions.length > 1) {
                        prevMidpoint = {x:(this.prevTouchPositions[0].x + this.prevTouchPositions[1].x) / 2 ,
                            y:(this.prevTouchPositions[0].y + this.prevTouchPositions[1].y) / 2 }
                    }

                    if (prevMidpoint !== undefined) {
                        var curMidpoint = {x:(ev.touches[0].pageX + ev.touches[1].pageX) / 2 ,
                            y:(ev.touches[0].pageY + ev.touches[1].pageY) / 2 }
                        var f = 2.0* Math.tan(this.viewInterface.fieldOfView/2.0) / this.height;
                        var dx = f*(curMidpoint.x - prevMidpoint.x);
                        var dy = f*(curMidpoint.y - prevMidpoint.y);
                        var trans = XML3D.Vec3.fromValues(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                        this.viewInterface.translate(this.viewInterface.inverseTransformOf(trans));
                    }
                }

                if (this.prevZoomVectorLength !== null) {
                    var dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    var currLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);

                    var dy = this.zoomSpeed * (currLength - this.prevZoomVectorLength) / this.height;
                    this.viewInterface.translate(this.viewInterface.inverseTransformOf(XML3D.Vec3.fromValues(0, 0, -dy)));

                    this.prevZoomVectorLength = currLength;
                } else {
                    var dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    this.prevZoomVectorLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);
                }

                break;
            case(this.ROTATE):
                var dx = -this.rotateSpeed*0.1 * (ev.touches[0].pageX - this.prevTouchPositions[0].x) * 2.0 * Math.PI / this.width;
                var dy = -this.rotateSpeed*0.1 * (ev.touches[0].pageY - this.prevTouchPositions[0].y) * 2.0 * Math.PI / this.height;

                var mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
                var my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
                mx = mx.mul(my);
                this.viewInterface.rotateAroundPoint(mx, this.revolveAroundPoint);
                break;
            case(this.LOOKAROUND):
                var dx = -this.rotateSpeed*0.1 * (ev.touches[0].pageX - this.prevTouchPositions[0].x) * 2.0 * Math.PI / this.width;
                var dy = this.rotateSpeed*0.1 * (ev.touches[0].pageY - this.prevTouchPositions[0].y) * 2.0 * Math.PI / this.height;
                var cross = this.upVector.cross(this.viewInterface.direction);

                var mx = XML3D.Quat.fromAxisAngle( this.upVector , dx);
                var my = XML3D.Quat.fromAxisAngle( cross , dy);

                this.viewInterface.lookAround(mx, my, this.upVector);
                break;
        }

        if (this.action != this.NO_MOUSE_ACTION) {
            var touchPositions = [];
            for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
            }
            this.prevTouchPositions = touchPositions;
            event.returnValue = false;
        }

        return false;
    };


    // -----------------------------------------------------
    // key movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.keyHandling = function(e) {
        var KeyID = e.keyCode;
        if (KeyID == 0) {
            switch (e.which) {
                case 119:
                    KeyID = 87;
                    break; // w
                case 100:
                    KeyID = 68;
                    break; // d
                case 97:
                    KeyID = 65;
                    break; // a
                case 115:
                    KeyID = 83;
                    break; // s
            }
        }

        var xml3d = this.xml3d;
        var view = this.viewInterface;
        var dir = view.direction;
        var np;
        if (xml3d) {
            switch (KeyID) {
                case 38: // up
                case 87: // w
                    np = view.position;
                    np.z += dir.z * this.zoomSpeed * 0.05;
                    np.x += dir.x * this.zoomSpeed * 0.05;
                    view.position = np;
                    break;
                case 39: // right
                case 68: // d
                    np = view.position;
                    np.x -= dir.z * this.zoomSpeed * 0.05;
                    np.z += dir.x * this.zoomSpeed * 0.05;
                    view.position = np;
                    break;
                case 37: // left
                case 65: // a
                    np = view.position;
                    np.x += dir.z * this.zoomSpeed * 0.05;
                    np.z -= dir.x * this.zoomSpeed * 0.05;
                    view.position = np;
                    break;
                case 40: // down
                case 83: // s
                    np = view.position;
                    np.z -= dir.z * this.zoomSpeed * 0.05;
                    np.x -= dir.x * this.zoomSpeed * 0.05;
                    view.position = np;
                    break;

                default:
                    return;
            }
        }
        this.stopEvent(e);
    };


    var ViewInterface = function(view, xml3d) {
        this.view = view;
        this.xml3d = xml3d;
        this.transform = this.getTransformForView(view);
    };

    ViewInterface.prototype.getTransformForView = function(view) {
        if (view.hasAttribute("transform")) {
            return document.querySelector(view.getAttribute("transform"));
        }
        return this.createTransformForView(view);
    };

    ViewInterface.prototype.createTransformForView = (function() {
        var viewCount = 0;
        return function(view) {
            var transform = document.createElement("transform");
            var tid = "Generated_Camera_Transform_" + viewCount++;
            transform.setAttribute("id", tid);
            view.parentElement.appendChild(transform);
            view.setAttribute("transform", "#"+tid);
            return transform;
        }
    })();

    ViewInterface.prototype.__defineGetter__("orientation", function() {
        return XML3D.Quat.fromAxisAngle(this.transform.rotation);
    });
    ViewInterface.prototype.__defineGetter__("position", function() {
        return this.transform.translation;
    });
    ViewInterface.prototype.__defineGetter__("worldPosition", function() {
        var tmat = this.view.getWorldMatrix();
        return new XML3D.Vec3.fromValues(tmat.m42, tmat.m43, tmat.m44);
    });
    ViewInterface.prototype.__defineSetter__("orientation", function(orientation) {
        var aa = XML3D.AxisAngle.fromQuat(orientation);
        this.transform.setAttribute("rotation", aa.toDOMString());
    });
    ViewInterface.prototype.__defineSetter__("position", function(position) {
        this.transform.setAttribute("translation", position.toDOMString());
    });
    ViewInterface.prototype.__defineGetter__("direction", function() {
        var dir = new XML3D.Vec3.fromValues(0, 0, -1);
        return dir.transformQuat(this.orientation);
    });
    ViewInterface.prototype.__defineGetter__("upVector", function() {
        var up = new XML3D.Vec3.fromValues(0, 1, 0);
        return up.transformQuat(this.orientation);
    });
    ViewInterface.prototype.__defineGetter__("fieldOfView", function() {
        var fovh = this.view.querySelector("float[name=fovHorizontal]");
        if (fovh) {
            var h = fovh.getValue();
            return 2 * Math.atan(Math.tan(h / 2.0) * this.xml3d.width / this.xml3d.height);
        }
        var fovv = this.view.querySelector("float[name=fovVertical]");
        if (fovv) {
            return fovv.getValue();
        }
        return (45 * Math.PI / 180); //Default FOV
    });

    ViewInterface.prototype.rotateAroundPoint = (function() {
        var tmpQuat = new XML3D.Quat();

        return function(q0, p0) {
            this.orientation = this.orientation.mul(q0).normalize();
            var aa = XML3D.AxisAngle.fromQuat(q0);
            var axis = this.inverseTransformOf(aa.axis);
            tmpQuat = XML3D.Quat.fromAxisAngle(axis, aa.angle);
            this.position = this.position.subtract(p0).transformQuat(tmpQuat).add(p0);
        }
    })();

    ViewInterface.prototype.lookAround = function(rotSide, rotUp, upVector) {
        var check = rotUp.mul(this.orientation);

        var tmp = XML3D.Vec3.fromValues(0,0,-1).transformQuat(check);
        var rot = rotSide.clone();
        if (Math.abs(upVector.dot(tmp)) <= 0.95) {
            rot = rot.mul(rotUp);
        }

        rot = rot.normalize().mul(this.orientation).normalize();
        this.orientation = rot;
    };

    ViewInterface.prototype.rotate = function(q0) {
        this.orientation = this.orientation.mul(q0).normalize();
    };

    ViewInterface.prototype.translate = function(t0) {
        this.position = this.position.add(t0);
    };

    ViewInterface.prototype.inverseTransformOf = function(vec) {
        return vec.transformQuat(this.orientation);
    };
})();
