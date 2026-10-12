// Agent Speak : bouton de barre du haut pour agent-speak (~/.local/bin/agent-speak).
// - pendant une lecture, un clic gauche sur l'icône l'arrête ;
// - sinon, le menu permet d'arrêter la lecture et d'activer/désactiver la voix ;
// - un raccourci clavier (configurable dans les préférences) arrête la lecture.
// L'état est lu dans les fichiers du script : $XDG_RUNTIME_DIR/agent-speak/pid
// (lecture en cours) et ~/.config/agent-speak/muted (voix désactivée).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const HOME = GLib.get_home_dir();
const AGENT_SPEAK = GLib.build_filenamev([HOME, '.local/bin/agent-speak']);
const RUN_DIR = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'agent-speak']);
const PIDFILE = GLib.build_filenamev([RUN_DIR, 'pid']);
const CONFIG_DIR = GLib.build_filenamev([HOME, '.config/agent-speak']);
const MUTED = GLib.build_filenamev([CONFIG_DIR, 'muted']);

function isSpeaking() {
    try {
        const [, bytes] = GLib.file_get_contents(PIDFILE);
        const pid = parseInt(new TextDecoder().decode(bytes), 10);
        return pid > 0 && GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS);
    } catch {
        return false;
    }
}

function isMuted() {
    return GLib.file_test(MUTED, GLib.FileTest.EXISTS);
}

function run(arg) {
    try {
        Gio.Subprocess.new([AGENT_SPEAK, arg], Gio.SubprocessFlags.NONE);
    } catch (e) {
        Main.notifyError('Agent Speak', `Impossible de lancer agent-speak : ${e.message}`);
    }
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Agent Speak');
        this._speaking = false;

        this._icon = new St.Icon({style_class: 'system-status-icon'});
        this.add_child(this._icon);

        this._stopItem = this.menu.addAction('Arrêter la lecture', () => run('--stop'),
            'media-playback-stop-symbolic');
        this._switch = new PopupMenu.PopupSwitchMenuItem('Lire les réponses à voix haute', true);
        this._switch.connect('toggled', (_item, on) => run(on ? '--unmute' : '--mute'));
        this.menu.addMenuItem(this._switch);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Paramètres…', () => extension.openPreferences());

        // Les dossiers peuvent ne pas encore exister : on les crée pour pouvoir les surveiller.
        this._monitors = [RUN_DIR, CONFIG_DIR].map(dir => {
            GLib.mkdir_with_parents(dir, 0o700);
            const m = Gio.File.new_for_path(dir).monitor_directory(Gio.FileMonitorFlags.NONE, null);
            m.connect('changed', () => this._refresh());
            return m;
        });
        this._refresh();
    }

    // Pendant une lecture, un clic gauche (ou un toucher) arrête directement la voix.
    vfunc_event(event) {
        const type = event.type();
        if (this._speaking &&
            ((type === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) ||
             type === Clutter.EventType.TOUCH_BEGIN)) {
            run('--stop');
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }

    _refresh() {
        const muted = isMuted();
        this._speaking = !muted && isSpeaking();

        this._icon.icon_name = this._speaking ? 'media-playback-stop-symbolic'
            : muted ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic';
        this._stopItem.setSensitive(this._speaking);
        this._switch.setToggleState(!muted);

        // La fin naturelle d'une lecture ne touche aucun fichier : on la détecte en sondant.
        if (this._speaking && !this._pollId) {
            this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._pollId = 0;
                this._refresh();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    destroy() {
        if (this._pollId)
            GLib.source_remove(this._pollId);
        this._monitors.forEach(m => m.cancel());
        super.destroy();
    }
});

export default class AgentSpeakExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settings = this.getSettings();
        Main.wm.addKeybinding('stop-shortcut', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => run('--stop'));
    }

    disable() {
        Main.wm.removeKeybinding('stop-shortcut');
        this._settings = null;
        this._indicator.destroy();
        this._indicator = null;
    }
}
