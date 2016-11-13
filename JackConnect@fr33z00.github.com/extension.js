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
let jackProxy = new jackPatchbayProxy(Gio.DBus.session, 'org.jackaudio.service','/org/jackaudio/Controller')

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
        this.matrix = new St.DrawingArea({reactive:true, can_focus: true});
        this.matrix.connect('repaint', Lang.bind(this, this._matrixRepaint));
        this.matrix.connect('button-press-event', Lang.bind(this, this._onClick));
//        this.matrix.connect('motion-event', Lang.bind(this, this._onMouseOver));
        this.setDimensions();
        this.matrix.visible = true;
        menuItem.actor = this.matrix;
        this.restoreConnections();

        this.menu.addMenuItem(menuItem);
    },
    
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

    saveConnection: function(connection) {
        let str = settings.get_string(this.label);
        settings.set_string(this.label, str + connection + ',');
    },

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

    restoreConnections: function() {
    },    

    addRemoveConnection: function(x, y) {
    },

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

    _onClick: function(actor, event) {
        let [x, y] = this.getCoordinate(actor, event);
        if (x == undefined)
            return Clutter.EVENT_STOP;
        this.addRemoveConnection(this.nboutputs-x-1, y);
        this.matrix.queue_repaint();
        return Clutter.EVENT_STOP;
    },
    
    _onMouseOver: function(actor, event) {
        let [x, y] = this.getCoordinate(actor, event);
        if (x == undefined)
            return Clutter.EVENT_STOP;
        
        return Clutter.EVENT_STOP;
    },

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

    activate: function(event) {

      this.parent(event);
    },

    _propertiesChanged: function(label) {
        this._label.text = label;
    },
});

const JackMenuItem = new Lang.Class({
    Name: 'JackMenuItem',
    Extends: JackBaseMenuItem,

    _init: function(label, inputs, outputs, connections) {
        this.parent(label, inputs, outputs, connections);
        this.portAppearedId = jackProxy.connectSignal('PortAppeared', Lang.bind(this, this.restoreConnections));
    },
    
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
            try {
                jackProxy.ConnectPortsByNameSync(con[0], con[1], con[2], con[3]);
            } catch(e) {
            }
        }
    },    

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
                jackProxy.DisconnectPortsByNameSync(port0, chan0, port1, chan1);
                this.deleteConnection(port0+'::'+chan0+'::'+port1+'::'+chan1);
            }
            else {
                jackProxy.ConnectPortsByNameSync(port0, chan0, port1, chan1);
                this.saveConnection(port0+'::'+chan0+'::'+port1+'::'+chan1);
            }
        }
    },

    detroy: function() {
        jackProxy.disconnectSignal(this.portAppearedId);
    },
});

Signals.addSignalMethods(JackMenuItem.prototype);

const AlsaMenuItem = new Lang.Class({
    Name: 'AlsaMenuItem',
    Extends: JackBaseMenuItem,

    _init: function(label, inputs, outputs, connections) {
        this.parent(label, inputs, outputs, connections);
    },

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
            let port0 = output.substr(1, output.indexOf(']'));
            let chan0 = output.substr(output.indexOf(':')+1, output.substr(output.indexOf(':')+1).lastIndexOf(']'));
            let port1 = input.substr(1, input.indexOf(']'));
            let chan1 = input.substr(input.indexOf(':')+1, input.substr(input.indexOf(':')+1).lastIndexOf(']'));
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

        this._sections["audio"] = new JackMenuItem("audio", this.audio_inputs, this.audio_outputs, this.audio_connections);
        this.menu.addMenuItem(this._sections["audio"]);
        this._sections["midi"] = new JackMenuItem("midi", this.midi_inputs, this.midi_outputs, this.midi_connections);
        this.menu.addMenuItem(this._sections["midi"]);
        this._sections["alsa"] = new AlsaMenuItem("alsa", this.alsa_inputs, this.alsa_outputs, this.alsa_connections);
        this.menu.addMenuItem(this._sections["alsa"]);

        this._getJackGraph();
        this._getAlsaGraph();
        this.graphChangedId = jackProxy.connectSignal('GraphChanged', Lang.bind(this, this._getJackGraph));
        this._sections["alsa"].connect('alsa-changed', Lang.bind(this, this._getAlsaGraph));

    },

    _getJackGraph: function() {
        let graph = jackProxy.GetGraphSync(0);
        this.parseJackGraph(graph);
        this._sections["audio"].setDimensions();
        this._sections["audio"].matrix.queue_repaint();
        this._sections["midi"].setDimensions();
        this._sections["midi"].matrix.queue_repaint();
    },

    _getAlsaGraph: function() {
        let [resi, inputs] = GLib.spawn_command_line_sync('aconnect -i');
        let [reso, outputs] = GLib.spawn_command_line_sync('aconnect -o');
        let [resg, graph] = GLib.spawn_command_line_sync('aconnect -l');
        if (resi && reso && resg) {
            this.parseAlsaGraph(String(inputs), String(outputs), String(graph));
            this._sections["alsa"].setDimensions();
            this._sections["alsa"].matrix.queue_repaint();
        }
    },

    parseJackGraph: function(graph) {
/*    JackPortIsInput = 0x1,
    JackPortIsOutput = 0x2,
    JackPortIsPhysical = 0x4,
    JackPortCanMonitor = 0x8,
    JackPortIsTerminal = 0x10,
*/
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
                    this.audio_inputs[ai][this.audio_inputs[ai].length] = name;
                    table[name] = [0, nai];
                    hasai = 1;
                    nai++;
                }
                else if (!ports[i][2][j][3] && (ports[i][2][j][2]&2)) {
                    if (this.audio_outputs[ao] == undefined)
                        this.audio_outputs[ao] = [];
                    this.audio_outputs[ao][this.audio_outputs[ao].length] = name;
                    table[name] = [0, nao];
                    hasao = 1;
                    nao++;
                }
                else if (ports[i][2][j][3] && (ports[i][2][j][2]&1)) {
                    if (this.midi_inputs[mi] == undefined)
                        this.midi_inputs[mi] = [];
                    this.midi_inputs[mi][this.midi_inputs[mi].length] = name;
                    table[name] = [1, nmi];
                    hasmi = 1;
                    nmi++;
                }
                else if (ports[i][2][j][3] && (ports[i][2][j][2]&2)) {
                    if (this.midi_outputs[mo] == undefined)
                        this.midi_outputs[mo] = [];
                    this.midi_outputs[mo][this.midi_outputs[mo].length] = name;
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
                this.midi_connections[this.midi_connections.length] = [table[conn_out][1], table[conn_in][1]];
            else
                this.audio_connections[this.audio_connections.length] = [table[conn_out][1], table[conn_in][1]];
        }
    },

    parseAlsaGraph: function(inputs, outputs, graph) {
        this.alsa_inputs.length = 0;
        this.alsa_outputs.length = 0;
        this.alsa_connections.length = 0;
        let respLines = inputs.split("\n");
        let client;
        let clientNb;
        let input_list = [];
        for (let i = 0; i < respLines.length; i++) {
            if (respLines[i].substr(0,1) != '\t' && respLines[i].substr(0,1) != ' ' && respLines[i].length > 1) {
                client = undefined;
                let clientLine = respLines[i].split("'");
                clientNb = parseInt(clientLine[0].split(' ')[1]);
                if (clientNb) {
                    client = '[' + clientNb + ']' + clientLine[1];
                    this.alsa_inputs[this.alsa_inputs.length] = [];
                }
            } else if (client && respLines[i].length > 1){
                let port = respLines[i].split("'");
                this.alsa_inputs[this.alsa_inputs.length-1][this.alsa_inputs[this.alsa_inputs.length-1].length] = client + ":[" + parseInt(port[0]) + "]" + port[1];
                input_list[input_list.length] = clientNb + ":" + parseInt(port[0]);
            }
        }
        let output_list = [];
        respLines = outputs.split("\n");
        for (let i = 0; i < respLines.length; i++) {
            if (respLines[i].substr(0,1) != '\t' && respLines[i].substr(0,1) != ' ' && respLines[i].length > 1) {
                client = undefined;
                let clientLine = respLines[i].split("'");
                clientNb = parseInt(clientLine[0].split(' ')[1]);
                if (clientNb) {
                    client = '[' + clientNb + ']' + clientLine[1];
                    this.alsa_outputs[this.alsa_outputs.length] = [];
                }
            } else if (client && respLines[i].length > 1){
                let port = respLines[i].split("'");
                this.alsa_outputs[this.alsa_outputs.length-1][this.alsa_outputs[this.alsa_outputs.length-1].length] = client + ":[" + parseInt(port[0]) + "]" + port[1];
                output_list[output_list.length] = clientNb + ":" + parseInt(port[0]);
            }
        }
        respLines = graph.split("\n");
        let type;
        let portIdxIn;
        let portIdxOut;
        for (let i = 0; i < respLines.length; i++) {
            if (respLines[i].substr(0,1) != '\t' && respLines[i].substr(0,1) != ' ' && respLines[i].length > 1) {
                client = undefined;
                type = 0;
                let clientLine = respLines[i].split("'");
                clientNb = parseInt(clientLine[0].split(' ')[1]);
                if (clientNb) {
                    client = '[' + clientNb + ']' + clientLine[1];
                }
            } else if (client && respLines[i].length > 1 && respLines[i].indexOf("'") > 0){
                let port = clientNb + ":" + parseInt(respLines[i].split("'")[0]);
                for (let j = 0; j < input_list.length; j++) {
                    if (port == input_list[j]) {
                        type = 1;
                        portIdxIn = j;
                        break;
                    }
                }
                for (let j = 0; j < output_list.length; j++) {
                    if (port == output_list[j]) {
                        type |= 2;
                        portIdxOut = j;
                        break;
                    }
                }
                
            } else if (client && respLines[i].length > 1){
                if (type&2) {
                    type &= 1;
                    let con_list = respLines[i].substr(respLines[i].indexOf(": ")).split(",");
                    for (let j = 0; j < con_list.length; j++)
                        for (let k = 0; k < input_list.length; k++) 
                            if (input_list[k] == con_list[j].substr(1))
                                this.alsa_connections[this.alsa_connections.length] = [portIdxOut,k];
                } else if (type&1) {
                    let con_list = respLines[i].substr(respLines[i].indexOf(": ")).split(",");
                    for (let j = 0; j < con_list.length; j++) {
                        for (let k = 0; k < output_list.length; k++)
                            if (output_list[k] == con_list[j].substr(1))
                                this.alsa_connections[this.alsa_connections.length] = [k, portIdxIn];
                    }
                }
            }
        }
    },

    destroy: function() {
        jackProxy.disconnectSignal(this.graphChangedId);
        this.parent();
    }

});

let jackmenu;
let settings;

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


function init(Metadata) {
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(Metadata.path);
    settings = get_settings();
}

function enable() {
    jackmenu = new JackMenu;
    Main.panel.addToStatusArea('jack-menu', jackmenu);
}

function disable() {
    jackmenu.destroy();
}
