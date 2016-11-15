/*******************************************************************************
MIT License

Copyright (c) 2016 fr33z00

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Author: fr33z00
******************************************************************************

This file is part of JackConnect Gnome extension

It creates a popup menu where it is possible to see and manage jack
connections.
*/
const Clutter = imports.gi.Clutter;
const Cairo = imports.cairo;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const St = imports.gi.St;
const Signals = imports.signals;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;

const ExtensionUtils = imports.misc.extensionUtils;

// JACK DBus interface
const jackPatchbayInterface = '<node>\
<interface name="org.jackaudio.JackPatchbay"> \
    <method name="ConnectPortsByName"> \
        <arg type="s" direction="in"/> \
        <arg type="s" direction="in"/> \
        <arg type="s" direction="in"/> \
        <arg type="s" direction="in"/> \
    </method> \
    <method name="DisconnectPortsByName"> \
        <arg type="s" direction="in"/> \
        <arg type="s" direction="in"/> \
        <arg type="s" direction="in"/> \
        <arg type="s" direction="in"/> \
    </method> \
    <method name="GetAllPorts"> \
        <arg type="as" direction="out"/> \
    </method> \
    <method name="GetGraph"> \
        <arg type="t" direction="in"/> \
        <arg name="graph" type="ta{tsa{tsuu}}a{tstststst}" direction="out"/> \
    </method> \
    <signal name="GraphChanged"> \
        <arg type="t" direction="out"/>\
    </signal> \
    <signal name="ClientAppeared"> \
        <arg type="tss" direction="out"/>\
    </signal> \
    <signal name="PortAppeared"> \
        <arg type="ttstsuu" direction="out"/>\
    </signal> \
</interface> \
</node>';
const jackPatchbayProxy = Gio.DBusProxy.makeProxyWrapper(jackPatchbayInterface);
let jpProxy = new jackPatchbayProxy(Gio.DBus.session, 'org.jackaudio.service','/org/jackaudio/Controller')

const jackControlInterface = '<node>\
<interface name="org.jackaudio.JackControl"> \
    <method name="IsStarted"> \
        <arg type="b" direction="out"/>\
    </method>\
    <signal name="ServerStarted"> \
    </signal> \
    <signal name="ServerStopped"> \
    </signal> \
</interface> \
</node>';
const jackControlProxy = Gio.DBusProxy.makeProxyWrapper(jackControlInterface);
let jcProxy = new jackControlProxy(Gio.DBus.session, 'org.jackaudio.service','/org/jackaudio/Controller');

// base class for the sub menu item with the connection matrix
const JackBaseMenuItem = new Lang.Class({
    Name: 'JackBaseMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(label, inputs, outputs, connections) {
        this.parent(label);

        let menuItem = new PopupMenu.PopupMenuItem("");

        this.label = label;
        this.inputs = inputs;
        this.outputs = outputs;
        this.connections = connections;
        // create the matrix element
        this.matrix = new St.DrawingArea({reactive:true, can_focus: true});
        this.matrix.connect('repaint', Lang.bind(this, this._matrixRepaint));
        this.matrix.connect('button-press-event', Lang.bind(this, this._onClick));
        this.setDimensions();
        this.matrix.visible = true;
        menuItem.actor = this.matrix;
        // restore connections saved during previous sessions
        this.restoreConnections();
        // add the submenu to the menu        
        this.menu.addMenuItem(menuItem);
    },

    // computes the size of the matrix depending on inputs and outputs numbers    
    setDimensions: function(){
        this.nboutputs = 0;
        this.nbinputs = 0;
        this.maxOutputSize = 0;
        this.maxInputSize = 0;
        let i, j;
        for (i = 0; i < this.outputs.length; i++)
            for (j = 0; j < this.outputs[i].length; j++) {
                if (this.outputs[i][j].length > this.maxOutputSize)
                    this.maxOutputSize = this.outputs[i][j].length;
                this.nboutputs++;
            }
        for (i = 0; i < this.inputs.length; i++)
            for (j = 0; j < this.inputs[i].length; j++) {
                if (this.inputs[i][j].length > this.maxInputSize)
                    this.maxInputSize = this.inputs[i][j].length;
                this.nbinputs++;
            }
        this.maxOutputSize *= 6;
        this.maxInputSize *= 6;
        this.matrix.width = 10 + this.maxOutputSize + this.nboutputs*20 + this.maxInputSize + 10;
        this.matrix.height = 30 + (this.nboutputs)*20 + this.nbinputs*20;
    },

    // the function to store one connection to disk
    saveConnection: function(connection) {
        let str = settings.get_string(this.label);
        settings.set_string(this.label, str + connection + ',');
    },

    // a function to delete one connection from disk
    deleteConnection: function(connection) {
        let str = settings.get_string(this.label);
        if (!str.length)
            return;
        let newstr = '';
        let con_list = str.split(',');
        for (let i = 0; i < con_list.length; i++)
            if (con_list[i] != connection && con_list[i].length)
                newstr += con_list[i] + ',';
        settings.set_string(this.label, newstr);
    },

    // the prototype of the function that restores the connections
    // needs to be replaced in classes based on this class 
    restoreConnections: function() {
    },    

    // the prototype of the function that add or remove a connection from the patchbay
    // needs to be replaced in classes based on this class 
    addRemoveConnection: function(x, y) {
    },

    // function to get the coordinates of a connection point
    getCoordinate: function (actor, event) {
        let [absX, absY] = event.get_coords();
        let [origX, origY] = this.actor.get_transformed_position();
        let [relX, relY] = [absX-origX, absY-origY];
        if (relX < (20+this.maxOutputSize) || relX > (39+this.maxOutputSize+20*this.nboutputs) || 
            relY < (50 + 20*this.nboutputs) || relY > (69+20*(this.nboutputs+this.nbinputs)))
            return [undefined, undefined];
        relX = (relX - (20+this.maxOutputSize)) >> 0;
        relY = (relY - (50 + 20*this.nboutputs)) >> 0;
        if ((relX%20) < 4 || (relX%20) > 16 || (relY%20) < 4 || (relY%20) > 16)
            return [undefined, undefined];
        relX = (relX/20)>>0;
        relY = (relY/20)>>0;
        return [relX, relY];
    },

    // function called on mouse click event
    _onClick: function(actor, event) {
        let [x, y] = this.getCoordinate(actor, event);
        if (x == undefined)
            return Clutter.EVENT_STOP;
        this.addRemoveConnection(this.nboutputs-x-1, y);
        this.matrix.queue_repaint();
        return Clutter.EVENT_STOP;
    },

    // function to repaint the matrix
    _matrixRepaint: function(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let lines_color = new Clutter.Color({red: 255, green: 255, blue: 255, alpha: 255});
        let group_color = new Clutter.Color({red:255, green:255, blue:255, alpha: 32});
        let conn_color = new Clutter.Color({red:33, green:93, blue:156, alpha: 255});

        let soFarOutputs = 0;
        let soFarInputs = 0;
        let i, j;
        for(i = 0; i < this.outputs.length; i++)
            for(j = 0; j < this.outputs[i].length; j++) {
                if (!(i%2)) {
                    Clutter.cairo_set_source_color(cr, group_color);
                    cr.setLineWidth(20);
                    cr.moveTo(10, 20*soFarOutputs+20);
                    cr.lineTo(10 + this.maxOutputSize + (this.nboutputs-soFarOutputs)*20, 20*soFarOutputs+20);
                    cr.lineTo(10 + this.maxOutputSize + (this.nboutputs-soFarOutputs)*20, this.matrix.height-10);
                    cr.stroke();
                }
                Clutter.cairo_set_source_color(cr, lines_color);
                cr.setLineWidth(1);
                if (j%2)
                    cr.setDash([1,1], 0);
                cr.moveTo(15, 20*soFarOutputs+25);
                cr.showText(this.outputs[i][j]);
                cr.relMoveTo(10, -5);
                cr.lineTo(10 + this.maxOutputSize + (this.nboutputs-soFarOutputs)*20, 20*soFarOutputs+20);
                cr.lineTo(10 + this.maxOutputSize + (this.nboutputs-soFarOutputs)*20, this.matrix.height-10);
                cr.stroke();
                cr.setDash([], 0);
                soFarOutputs++;
            }

        for(i = 0; i < this.inputs.length; i++)
            for(j = 0; j < this.inputs[i].length; j++) {
                if (!(i%2)) {
                    Clutter.cairo_set_source_color(cr, group_color);
                    cr.setLineWidth(20);
                    cr.moveTo(10+this.maxOutputSize, 30 + 20*(this.nboutputs + soFarInputs));
                    cr.lineTo(this.matrix.width-10, 30 + 20*(this.nboutputs + soFarInputs));
                    cr.stroke();
                }
                Clutter.cairo_set_source_color(cr, lines_color);
                cr.setLineWidth(1);
                if (j%2)
                    cr.setDash([1,1], 1);
                cr.moveTo(20+this.maxOutputSize, 30 + 20*(this.nboutputs + soFarInputs));
                cr.lineTo(30+this.maxOutputSize+20*this.nboutputs, 30 + 20*(this.nboutputs + soFarInputs));
                cr.moveTo(40+this.maxOutputSize+20*this.nboutputs, 35 + 20*(this.nboutputs + soFarInputs));
                cr.showText(this.inputs[i][j]);
                cr.stroke();
                cr.setDash([], 0);
                soFarInputs++;
            }

        for (i = 0; i < this.connections.length; i++) {
            Clutter.cairo_set_source_color(cr, conn_color);
            cr.setLineWidth(1);
            cr.arc(10+this.maxOutputSize + 20*(this.nboutputs-this.connections[i][0]), 30 + 20*(this.nboutputs + this.connections[i][1]), 5, 0, Math.PI * 2);
            cr.fillPreserve();
            cr.stroke();

            Clutter.cairo_set_source_color(cr, lines_color);
            cr.setLineWidth(1);
            cr.arc(10+this.maxOutputSize + 20*(this.nboutputs-this.connections[i][0]), 30 + 20*(this.nboutputs + this.connections[i][1]), 5, 0, Math.PI * 2);
            cr.stroke();
        }

        cr.$dispose();
    },

    destroy: function() {
        this.parent();
    },

});

// final class of the audio and midi submenu
const JackMenuItem = new Lang.Class({
    Name: 'JackMenuItem',
    Extends: JackBaseMenuItem,

    _init: function(label, inputs, outputs, connections) {
        this.parent(label, inputs, outputs, connections);
    },

    // function to restore the audio/midi connections    
    restoreConnections: function() {
        let str = settings.get_string(this.label);
        let con_list = str.split(',');
        if (!con_list.length)
            return;
        let port_list;
        try{
            if (jcProxy.IsStartedSync())
                port_list = jpProxy.GetAllPortsSync();
            else
                return;
        } catch(e) {
            return;
        }
        port_list = String(port_list).split(',');
        for (let i = 0; i < con_list.length; i++) {
            if (!con_list[i].length)
                continue;
            let con = con_list[i].split('::');
            if (con.length != 4)
                continue;
            let port0, chan0, port1, chan1;
            for (let j = 0; j < port_list.length; j++) {
                let port = port_list[j].split(':')[0];
                let chan = port_list[j].split(':')[1];
                if (port.match(/\D*/) == con[0] && chan == con[1]) {
                    port0 = port;
                    chan0 = chan;
                }
                if (port.match(/\D*/) == con[2] && chan == con[3]) {
                    port1 = port;
                    chan1 = chan;
                }
                if (port0 && port1)
                    break;
            }
            if (port0 && port1)
                try {
                    jpProxy.ConnectPortsByNameSync(port0, chan0, port1, chan1);
                } catch(e){
                }
        }
    },    

    // function to add or remove a connection to/from the connection graph
    addRemoveConnection: function(x, y) {
        let i, j;
        let soFarOutputs = 0;
        let soFarInputs = 0;
        let input, output, connected = 0;
        for (i = 0; i < this.outputs.length; i++) {
            for (j = 0; j < this.outputs[i].length; j++, soFarOutputs++) {
                if (soFarOutputs == x) {
                    output = this.outputs[i][j];
                    break;
                }
            }
            if (output)
                break;
        }
        for (i = 0; i < this.inputs.length; i++) {
            for (j = 0; j < this.inputs[i].length; j++, soFarInputs++) {
                if (soFarInputs == y) {
                    input = this.inputs[i][j];
                    break;
                }
            }
            if (input)
                break;
        }
        for (i = 0; i < this.connections.length; i++){
            if (this.connections[i][0] == x && this.connections[i][1] == y) {
                connected = 1;
                break;
            }
        }
        if (input && output) {
            let port0 = output.substr(0, output.indexOf(':'));
            let chan0 = output.substr(output.indexOf(':')+1);
            let port1 = input.substr(0, input.indexOf(':'));
            let chan1 = input.substr(input.indexOf(':')+1);
            if (connected) {
                jpProxy.DisconnectPortsByNameSync(port0, chan0, port1, chan1);
                this.deleteConnection(port0.match(/\D*/)+'::'+chan0+'::'+port1.match(/\D*/)+'::'+chan1);
            }
            else {
                jpProxy.ConnectPortsByNameSync(port0, chan0, port1, chan1);
                this.saveConnection(port0.match(/\D*/)+'::'+chan0+'::'+port1.match(/\D*/)+'::'+chan1);
            }
        }
    },

    destroy: function() {
        this.parent();
    },

});

Signals.addSignalMethods(JackMenuItem.prototype);

// final class of the alsa submenu item
const AlsaMenuItem = new Lang.Class({
    Name: 'AlsaMenuItem',
    Extends: JackBaseMenuItem,

    _init: function(label, inputs, outputs, connections) {
        this.parent(label, inputs, outputs, connections);
    },

    // function to restore the alsa connections    
    restoreConnections: function() {
        let str = settings.get_string(this.label);
        let con_list = str.split(',');
        if (!con_list.length)
            return;
        for (let i = 0; i < con_list.length; i++) {
            if (!con_list[i].length)
                continue;
            let con = con_list[i].split('::');
            if (con.length != 4)
                continue;
            GLib.spawn_command_line_sync('aconnect ' + con[0] + ':' + con[1] + ' ' + con[2] + ':' + con[3]);
        }
    },
    
    // function to add or remove a connection to/from the alsa connection graph
    addRemoveConnection: function(x, y) {
        let i, j;
        let soFarOutputs = 0;
        let soFarInputs = 0;
        let input, output, connected = 0;
        for (i = 0; i < this.outputs.length; i++) {
            for (j = 0; j < this.outputs[i].length; j++, soFarOutputs++) {
                if (soFarOutputs == x) {
                    output = this.outputs[i][j];
                    break;
                }
            }
            if (output)
                break;
        }
        for (i = 0; i < this.inputs.length; i++) {
            for (j = 0; j < this.inputs[i].length; j++, soFarInputs++) {
                if (soFarInputs == y) {
                    input = this.inputs[i][j];
                    break;
                }
            }
            if (input)
                break;
        }
        for (i = 0; i < this.connections.length; i++){
            if (this.connections[i][0] == x && this.connections[i][1] == y) {
                connected = 1;
                break;
            }
        }
        if (input && output) {
            let port0 = output.split(':')[0].match(/\d+/);
            let chan0 = output.split(':')[1].match(/\d+/);
            let port1 = input.split(':')[0].match(/\d+/);
            let chan1 = input.split(':')[1].match(/\d+/);
            if (connected) {
                GLib.spawn_command_line_sync('aconnect -d ' + port0 + ':' + chan0 + ' ' + port1 + ':' + chan1);
                this.deleteConnection(port0+'::'+chan0+'::'+port1+'::'+chan1);
            }
            else {
                GLib.spawn_command_line_sync('aconnect ' + port0 + ':' + chan0 + ' ' + port1 + ':' + chan1);
                this.saveConnection(port0+'::'+chan0+'::'+port1+'::'+chan1);
            }
            this.emit("alsa-changed");
        }
    },

    destroy: function() {
        this.parent();
    },

});

Signals.addSignalMethods(AlsaMenuItem.prototype);


const JackMenu = new Lang.Class({
    Name: 'JackMenu',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "JackConnect");

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        let icon = new St.Icon({ icon_name: 'jack-connect',
                                 style_class: 'system-status-icon' });
        hbox.add_child(icon);
        this.actor.add_actor(hbox);
        
        this.audio_inputs = [];
        this.audio_outputs = [];
        this.audio_connections = [];
        this.midi_inputs = [];
        this.midi_outputs = [];
        this.midi_connections = [];
        this.alsa_inputs = [];
        this.alsa_outputs = [];
        this.alsa_connections = [];

        this._sections = { };

        //create the submenu sections
        this._sections["audio"] = new JackMenuItem("audio", this.audio_inputs, this.audio_outputs, this.audio_connections);
        this.menu.addMenuItem(this._sections["audio"]);
        this._sections["midi"] = new JackMenuItem("midi", this.midi_inputs, this.midi_outputs, this.midi_connections);
        this.menu.addMenuItem(this._sections["midi"]);
        this._sections["alsa"] = new AlsaMenuItem("alsa", this.alsa_inputs, this.alsa_outputs, this.alsa_connections);
        this.menu.addMenuItem(this._sections["alsa"]);

        // parse the connection graphs
        this._getJackGraph();
        this._getAlsaGraph();
        // connect signals
        this.graphChangedId = jpProxy.connectSignal('GraphChanged', Lang.bind(this, this._getJackGraph));
        this.serverStoppedId = jcProxy.connectSignal('ServerStopped', Lang.bind(this, this._clearConnections));
        this._sections["alsa"].connect('alsa-changed', Lang.bind(this, this._getAlsaGraph));

    },

    _clearConnections: function() {
        this.audio_inputs.length = 0;
        this.audio_outputs.length = 0;
        this.audio_connections.length = 0;
        this.midi_inputs.length = 0;
        this.midi_outputs.length = 0;
        this.midi_connections.length = 0;
        this._sections["audio"].setDimensions();
        this._sections["audio"].matrix.queue_repaint();
        this._sections["midi"].setDimensions();
        this._sections["midi"].matrix.queue_repaint();
    },

    // function that retrieves the jack graph through DBus
    _getJackGraph: function() {
        let graph;
        try {
            if (jcProxy.IsStartedSync())
                graph = jpProxy.GetGraphSync(0);
            else {
                this._clearConnections();
                return;
            }
        } catch(e) {
            this._clearConnections();
            return;
        }
        this.parseJackGraph(graph);
        this._sections["audio"].restoreConnections();
        this._sections["audio"].setDimensions();
        this._sections["audio"].matrix.queue_repaint();
        this._sections["midi"].restoreConnections();
        this._sections["midi"].setDimensions();
        this._sections["midi"].matrix.queue_repaint();
    },

    // function that retrieves the alsa graph from /proc/asound/seq/clients file
    _getAlsaGraph: function() {
        let [res, seq] = GLib.spawn_command_line_sync('cat /proc/asound/seq/clients');
        if (!res)
            return;
        let graph = String(seq).split('Client');
        graph.shift();
        graph.shift();
        graph.shift();
        this.parseAlsaGraph(graph);
        this._sections["alsa"].restoreConnections();
        this._sections["alsa"].setDimensions();
        this._sections["alsa"].matrix.queue_repaint();
    },

    // parsing function for the jack connection graph
    parseJackGraph: function(graph) {
        let ports = graph[1];
        this.audio_inputs.length = 0;
        this.audio_outputs.length = 0;
        this.audio_connections.length = 0;
        this.midi_inputs.length = 0;
        this.midi_outputs.length = 0;
        this.midi_connections.length = 0;
        let ai = 0;
        let ao = 0;
        let mi = 0;
        let mo = 0;
        let nai = 0;
        let nao = 0;
        let nmi = 0;
        let nmo = 0;
        let table = {};
        for (let i = 0; i < ports.length; i++) {
            let hasai = 0;
            let hasao = 0;
            let hasmi = 0;
            let hasmo = 0;
            let name = '';
            for (let j = 0; j < ports[i][2].length; j++) {
                name = ports[i][1] + ":" + ports[i][2][j][1];
                if (!ports[i][2][j][3] && (ports[i][2][j][2]&1)) {
                    if (this.audio_inputs[ai] == undefined)
                        this.audio_inputs[ai] = [];
                    this.audio_inputs[ai].push(name);
                    table[name] = [0, nai];
                    hasai = 1;
                    nai++;
                }
                else if (!ports[i][2][j][3] && (ports[i][2][j][2]&2)) {
                    if (this.audio_outputs[ao] == undefined)
                        this.audio_outputs[ao] = [];
                    this.audio_outputs[ao].push(name);
                    table[name] = [0, nao];
                    hasao = 1;
                    nao++;
                }
                else if (ports[i][2][j][3] && (ports[i][2][j][2]&1)) {
                    if (this.midi_inputs[mi] == undefined)
                        this.midi_inputs[mi] = [];
                    this.midi_inputs[mi].push(name);
                    table[name] = [1, nmi];
                    hasmi = 1;
                    nmi++;
                }
                else if (ports[i][2][j][3] && (ports[i][2][j][2]&2)) {
                    if (this.midi_outputs[mo] == undefined)
                        this.midi_outputs[mo] = [];
                    this.midi_outputs[mo].push(name);
                    table[name] = [1, nmo];
                    hasmo = 1;
                    nmo++;
                }
            }
            ai += hasai;
            ao += hasao;
            mi += hasmi;
            mo += hasmo;
        }
        let connections = graph[2];

        for (let i = 0; i < connections.length; i++) {
            let conn_out = connections[i][1] + ":" + connections[i][3];
            let conn_in = connections[i][5] + ":" + connections[i][7];
            if (table[conn_in][0]) 
                this.midi_connections.push([table[conn_out][1], table[conn_in][1]]);
            else
                this.audio_connections.push([table[conn_out][1], table[conn_in][1]]);
        }
    },

    // parsing function for the alsa connection graph
    parseAlsaGraph: function(graph) {
        this.alsa_inputs.length = 0;
        this.alsa_outputs.length = 0;
        this.alsa_connections.length = 0;
        let clients = {};
        let clients_list = [];
        let clientIdx = 0;
        let inputs = 0;
        let outputs = 0;
        for (let i = 0; i < graph.length; i++) {
            clientNb = parseInt(graph[i].match(/\d+/));
            if (!clientNb || clientNb > 127)
                continue;
            clientName = String(graph[i].match(/".+"/)).replace('"','').replace('"','');
            clients_list.push(clientNb);
            clients[clientNb] = {};
            clients[clientNb].name = clientName;
            clients[clientNb].idx = clientIdx;
            clients[clientNb].inputs = [];
            clients[clientNb].outputs = [];
            let ports = graph[i].split('Port ');
            ports.shift();

            clients[clientNb].connectionsTo = [];
            clients[clientNb].connectionsFrom = [];
            for (let j = 0; j < ports.length; j++) {
                let portNb = parseInt(ports[j].match(/\d/));
                let portName = String(ports[j].match(/".+"/)).replace('"','').replace('"','');
                let portFlags = String(ports[j].match(/\(.+\)/));
                let conTo = String(ports[j].match(/Connecting To.*\n/));
                let conFrom = String(ports[j].match(/Connected From.*\n/));
                if (portFlags.toLowerCase().indexOf('r') >= 0)
                    clients[clientNb].outputs[portNb] = [outputs++, portName, conTo.match(/\d+:\d+/g)];
                if (portFlags.toLowerCase().indexOf('w') >= 0)
                    clients[clientNb].inputs[portNb] = [inputs++, portName, conFrom.match(/\d+:\d+/g)];
            }                
            clientIdx++;
        }
        Main.cli = clients;
        for (let i = 0; i < clients_list.length; i++) {
            let client = clients[clients_list[i]];
            let inputs = [];
            let outputs = [];
            for (let j = 0; j < client.inputs.length; j++)
                if (client.inputs[j]) {
                    inputs.push('[' + clients_list[i] + ']' + client.name + ':[' + j + ']' + client.inputs[j][1]);
                    for (let k = 0; k < client.inputs[j][2].length; k++) {
                        let srcClient = parseInt(client.inputs[j][2][k].substr(0, client.inputs[j][2][k].indexOf(':')));
                        if (srcClient > 127)
                            continue;
                        let srcPort = parseInt(client.inputs[j][2][k].substr(client.inputs[j][2][k].indexOf(':')+1));
                        this.alsa_connections.push([clients[srcClient].outputs[srcPort][0], client.inputs[j][0]]);
                    }
                }
            for (let j = 0; j < client.outputs.length; j++)
                if (client.outputs[j]) {
                    outputs.push('[' + clients_list[i] + ']' + client.name + ':[' + j + ']' + client.outputs[j][1]);
                    for (let k = 0; k < client.outputs[j][2].length; k++) {
                        let destClient = parseInt(client.outputs[j][2][k].substr(0, client.outputs[j][2][k].indexOf(':')));
                        if (destClient > 127)
                            continue;
                        let destPort = parseInt(client.outputs[j][2][k].substr(client.outputs[j][2][k].indexOf(':')+1));
                        this.alsa_connections.push([client.outputs[j][0], clients[destClient].inputs[destPort][0]]);
                    }
                }
            this.alsa_inputs.push(inputs);
            this.alsa_outputs.push(outputs);
        }
    },

    destroy: function() {
        if (this.graphChangedId)
            jpProxy.disconnectSignal(this.graphChangedId);
        if (this.serverStoppedId)
            jcProxy.disconnectSignal(this.serverStoppedId);
        this._sections["audio"].destroy;
        this._sections["midi"].destroy;
        this._sections["alsa"].destroy;
        this.parent();
    }

});
Signals.addSignalMethods(JackMenu.prototype);

let jackmenu = null;
let settings;
let remove_timeout = 0;
let alsa_clients = 0;

// function to retrieve settings
function get_settings() {
    let schema_id = "org.gnome.shell.extensions.JackConnect";
    let schema_path = ExtensionUtils.getCurrentExtension().path + "/schemas";
    let schema_source = Gio.SettingsSchemaSource.new_from_directory(schema_path,
                        Gio.SettingsSchemaSource.get_default(),
                        false);
    if (!schema_source) {
            throw new Error("Local schema directory for " + schema_id + " is missing");
    }
    let schema = schema_source.lookup(schema_id, true);
    if (!schema) {
            throw new Error("Schema " + schema_id + " is missing. Has glib-compile-schemas been called for it?");
    }
    return new Gio.Settings({settings_schema: schema});
}

// callback function to periodically check the alsa state
function check_alsa_clients (){
    if (remove_timeout) {
        jackmenu.destroy();
        jackmenu = null;
        return false;
    }
    let [res, out] = GLib.spawn_command_line_sync('cat /proc/asound/seq/clients | grep "cur  clients"');
    let clients = parseInt(String(out).match(/\d/));
    if (clients != alsa_clients) {
        alsa_clients = clients;
        jackmenu._getAlsaGraph();
    }
    return true;
}

function init(Metadata) {
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(Metadata.path);
    settings = get_settings();
}

function enable() {
    if (jackmenu == null) {
        jackmenu = new JackMenu;
        alsa_clients = 0;
        remove_timeout = 0;
        GLib.timeout_add_seconds(1, 1, check_alsa_clients);
    }
    Main.panel.addToStatusArea('jack-menu', jackmenu);
}

function disable() {
    remove_timeout = 1;
}
