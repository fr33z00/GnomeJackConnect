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
</interface> \
</node>';
const jackPatchbayProxy = Gio.DBusProxy.makeProxyWrapper(jackPatchbayInterface);
let jackProxy = new jackPatchbayProxy(Gio.DBus.session, 'org.jackaudio.service','/org/jackaudio/Controller')

const JackMenuItem = new Lang.Class({
    Name: 'JackMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    _init: function(info, inputs, outputs, connections) {
        this.parent(info);

        let menuItem = new PopupMenu.PopupMenuItem("toto");

        this.outputs = [['system:capture_1', 'system:capture_2'],['webcam:capture_1'], ['PulseAudio Jack Sink:front-left', 'PulseAudio Jack Sink:front-right']];
        this.inputs = [['system:playback_1', 'system:playback_2']];

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
            let con0 = output.substr(output.indexOf(':')+1);
            let port1 = input.substr(0, input.indexOf(':'));
            let con1 = input.substr(input.indexOf(':')+1);
            if (connected)
                jackProxy.DisconnectPortsByNameSync(port0, con0, port1, con1);
            else
                jackProxy.ConnectPortsByNameSync(port0, con0, port1, con1);
        }
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
                cr.moveTo(15, 20*soFarOutputs+25);
                cr.showText(this.outputs[i][j]);
                cr.relMoveTo(10, -5);
                cr.lineTo(10 + this.maxOutputSize + (this.nboutputs-soFarOutputs)*20, 20*soFarOutputs+20);
                cr.lineTo(10 + this.maxOutputSize + (this.nboutputs-soFarOutputs)*20, this.matrix.height-10);
                cr.stroke();
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
                cr.moveTo(20+this.maxOutputSize, 30 + 20*(this.nboutputs + soFarInputs));
                cr.lineTo(30+this.maxOutputSize+20*this.nboutputs, 30 + 20*(this.nboutputs + soFarInputs));
                cr.moveTo(40+this.maxOutputSize+20*this.nboutputs, 35 + 20*(this.nboutputs + soFarInputs));
                cr.showText(this.inputs[i][j]);
                cr.stroke();
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

    _propertiesChanged: function(info) {
        this._label.text = info;
    },
});

Signals.addSignalMethods(JackMenuItem.prototype);

const SECTIONS = [
    'audio',
    'midi',
    'alsa'
]

const JackMenu = new Lang.Class({
    Name: 'JackMenu',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "JackConnect");
//        this.parent();

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

        this._sections = { };

        this._sections["audio"] = new JackMenuItem("audio", this.audio_inputs, this.audio_outputs, this.audio_connections);
        this.menu.addMenuItem(this._sections["audio"]);
        this._sections["midi"] = new JackMenuItem("midi", this.midi_inputs, this.midi_outputs, this.midi_connections);
        this.menu.addMenuItem(this._sections["midi"]);

        this._getGraph();
        this.graphChangedId = jackProxy.connectSignal('GraphChanged', Lang.bind(this, this._getGraph));

    },

    _getGraph: function() {
        this.graph = jackProxy.GetGraphSync(0);
        this.parseGraph();
        this._sections["audio"].inputs = this.audio_inputs;
        this._sections["audio"].outputs = this.audio_outputs;
        this._sections["audio"].connections = this.audio_connections;
        this._sections["audio"].setDimensions();
        this._sections["audio"].matrix.queue_repaint();
        this._sections["midi"].inputs = this.midi_inputs;
        this._sections["midi"].outputs = this.midi_outputs;
        this._sections["midi"].connections = this.midi_connections;
        this._sections["midi"].setDimensions();
        this._sections["midi"].matrix.queue_repaint();
    },

    parseGraph: function() {
/*    JackPortIsInput = 0x1,
    JackPortIsOutput = 0x2,
    JackPortIsPhysical = 0x4,
    JackPortCanMonitor = 0x8,
    JackPortIsTerminal = 0x10,
*/
        let ports = this.graph[1];
        this.audio_inputs = [];
        this.audio_outputs = [];
        this.audio_connections = [];
        this.midi_inputs = [];
        this.midi_outputs = [];
        this.midi_connections = [];
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
        let connections = this.graph[2];

        for (let i = 0; i < connections.length; i++) {
            let conn_out = connections[i][1] + ":" + connections[i][3];
            let conn_in = connections[i][5] + ":" + connections[i][7];
            if (table[conn_in][0]) 
                this.midi_connections[this.midi_connections.length] = [table[conn_out][1], table[conn_in][1]];
            else
                this.audio_connections[this.audio_connections.length] = [table[conn_out][1], table[conn_in][1]];
        }
    },


    destroy: function() {

        this.parent();
    }

});

let _indicator;
let button;

function init(Metadata) {
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(Metadata.path);
}

function enable() {
    _indicator = new JackMenu;
    Main.panel.addToStatusArea('jack-menu', _indicator);
}

function disable() {
    _indicator.destroy();
}
