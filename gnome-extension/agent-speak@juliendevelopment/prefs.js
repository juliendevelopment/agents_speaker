// Préférences d'Agent Speak : choix du raccourci clavier qui arrête la lecture.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEY = 'stop-shortcut';

export default class AgentSpeakPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // garde les réglages en vie avec la fenêtre

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Raccourci clavier',
            description: 'Clique sur la ligne puis tape la nouvelle combinaison.',
        });
        page.add(group);
        window.add(page);

        const label = new Gtk.ShortcutLabel({disabled_text: 'Désactivé', valign: Gtk.Align.CENTER});
        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: 'Revenir au raccourci par défaut',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        reset.connect('clicked', () => settings.reset(KEY));

        const row = new Adw.ActionRow({title: 'Arrêter la lecture', activatable: true});
        row.add_suffix(label);
        row.add_suffix(reset);
        row.connect('activated', () => this._capture(window, settings));
        group.add(row);

        const sync = () => {
            label.accelerator = settings.get_strv(KEY)[0] ?? '';
            reset.sensitive = settings.get_user_value(KEY) !== null;
        };
        settings.connect(`changed::${KEY}`, sync);
        sync();
    }

    // Fenêtre modale qui attend la prochaine combinaison de touches.
    _capture(parent, settings) {
        const dialog = new Adw.Window({
            transient_for: parent,
            modal: true,
            title: 'Nouveau raccourci',
            default_width: 420,
        });
        dialog.set_content(new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: 'Tape la nouvelle combinaison',
            description: 'Échap pour annuler, Retour arrière pour désactiver le raccourci.',
        }));

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval, _keycode, state) => {
            const mods = state & Gtk.accelerator_get_default_mod_mask();
            keyval = Gdk.keyval_to_lower(keyval);

            if (!mods && keyval === Gdk.KEY_Escape) {
                dialog.close();
            } else if (!mods && keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(KEY, []);
                dialog.close();
            } else if (Gtk.accelerator_valid(keyval, mods) &&
                       // une lettre seule capturerait la frappe partout : on exige un modificateur,
                       // sauf pour les touches de fonction
                       (mods || (keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F35))) {
                settings.set_strv(KEY, [Gtk.accelerator_name(keyval, mods)]);
                dialog.close();
            }
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keys);
        dialog.present();
    }
}
