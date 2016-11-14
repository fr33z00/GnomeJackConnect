# GnomeJackConnect
A JACK (Jack Audio Connection Kit) connection manager extension for Gnome

![Alt text](jackConnect.png?raw=true "Title")

This extensions aim is to bring a convenient way to manage JACK connections in a daily use.
It may not replace QjackCtl or equivalent for fine jack tuning, but will probably avoid launching it
for very simple tasks.

Requirements
------------

- Gnome 3.20 (other versions untested, but may work from 3.16 and above. Needs metadata.json edition)
- JackDbus
- aconnect (alsa-utils)

Installation
------------

- Clone somewhere
```
git clone https://github.com/fr33z00/GnomeJackConnect
```
- Copy/move to your local gnome extension folder
```
mv GnomeJackConnect/JackConnect@fr33z00.github.com ~/.local/share/gnome-shell/extensions/
```

- Enable the extension 
```
gnome-shell-extension-tool -e JackConnect@fr33z00.github.com
```
- Finally, restart gnome-shell with Alt+F2 r (Enter)

For required/optionnal software installation, please refer to their respective documentations.

Usage
-----

Once installed and enabled, you should get a new menu, as shown in the above screenshot. It offers
the 3 sections that you may already know : audio, midi and alsa.
Each section shows a routing matrix, with sources on top left and destinations on bottom right. 
Just click at the intersection of the wires you want to connect/disconnect.

Note
----

Connections you made will be restored at your next session.

Enjoy!
