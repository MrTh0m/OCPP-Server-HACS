# OCPP Server Cards

Deux cards Lovelace pour l'add-on Home Assistant **OCPP Backoffice Server** ([MrTh0m/hassio-addons](https://github.com/MrTh0m/hassio-addons)). Elles lisent les entités que l'add-on publie par MQTT Discovery.

- `custom:ocpp-charger-card` : statut d'un connecteur, puissance, bilan de la session ou de la dernière charge, bouton pour démarrer ou arrêter.
- `custom:ocpp-vehicle-card` : consommation et coût estimés aux 100 km, dernière charge, kilométrage.

Add-on requis : **0.19.42 ou plus récent** (capteur « En ligne », capteurs dérivés du véhicule, valeurs de session remises à zéro).

## Installation (HACS)

1. HACS, menu à trois points, **Dépôts personnalisés**.
2. Ajouter `https://github.com/MrTh0m/OCPP-Server-HACS`, type **Dashboard**.
3. Installer « OCPP Server Cards », puis recharger le navigateur.

Installation manuelle : copier `dist/ocpp-server-cards.js` dans `config/www/` et l'ajouter comme ressource `/local/ocpp-server-cards.js` (module JavaScript).

## Card borne

```yaml
type: custom:ocpp-charger-card
entity: sensor.borne_xxx_connecteur_1_statut
name: Borne maison
subtitle: Schneider EVlink Home
```

| Option | Obligatoire | Rôle |
| --- | --- | --- |
| `entity` | oui | Capteur de statut du connecteur |
| `name` | non | Nom affiché |
| `subtitle` | non | Ligne sous le nom |
| `image` | non | URL d'une image de borne (par exemple `/local/borne.png`) |
| `entities` | non | Remplacer une entité retrouvée automatiquement |

L'image par défaut a un voyant vert ; la card la recolore selon le statut (bleu en charge, orange en pause, rouge en défaut, grise hors ligne). Une image personnalisée est recolorée de la même façon : partez d'un visuel à voyant vert.

Le bouton agit sur l'interrupteur « autoriser la charge » : **Démarrer** quand un véhicule est branché, **Arrêter** pendant la charge.

## Card véhicule

```yaml
type: custom:ocpp-vehicle-card
entity: binary_sensor.ma_voiture_en_charge
```

| Option | Obligatoire | Rôle |
| --- | --- | --- |
| `entity` | oui | Capteur « En charge » du véhicule |
| `name` | non | Nom affiché (par défaut, celui de l'appareil) |
| `entities` | non | Remplacer une entité retrouvée automatiquement |

La consommation et le coût aux 100 km sont des estimations : ils supposent que la dernière charge a rendu à la batterie ce que les kilomètres parcourus depuis la charge précédente avaient consommé. Ils demandent l'odomètre saisi sur les deux charges.

## Entités retrouvées automatiquement

Les cards partent de l'entité principale et en déduisent les autres par leur identifiant. Si vous avez renommé une entité, indiquez-la dans `entities`.

Borne, à partir de `sensor.<borne>_connecteur_<n>_statut` :

| Clé | Entité attendue |
| --- | --- |
| `power` | `sensor.<borne>_connecteur_<n>_puissance` |
| `current` | `sensor.<borne>_connecteur_<n>_courant` |
| `voltage` | `sensor.<borne>_connecteur_<n>_tension` |
| `sessionEnergy` | `sensor.<borne>_connecteur_<n>_energie_session` |
| `sessionCost` | `sensor.<borne>_connecteur_<n>_cout_session` |
| `duration` | `sensor.<borne>_connecteur_<n>_duree_de_charge` |
| `start` | `sensor.<borne>_connecteur_<n>_debut_de_session` |
| `lastEnergy` | `sensor.<borne>_connecteur_<n>_derniere_charge_energie` |
| `lastCost` | `sensor.<borne>_connecteur_<n>_derniere_charge_cout` |
| `total` | `sensor.<borne>_connecteur_<n>_energie_totale` |
| `control` | `switch.<borne>_connecteur_<n>_autoriser_la_charge` |
| `online` | `binary_sensor.<borne>_en_ligne` |

Véhicule, à partir de `binary_sensor.<vehicule>_en_charge` :

| Clé | Entité attendue |
| --- | --- |
| `chargingAt` | `sensor.<vehicule>_en_charge_sur` |
| `sessionEnergy` | `sensor.<vehicule>_energie_session` |
| `sessionCost` | `sensor.<vehicule>_cout_session` |
| `duration` | `sensor.<vehicule>_duree_de_charge` |
| `consumption` | `sensor.<vehicule>_consommation_estimee` |
| `cost100` | `sensor.<vehicule>_cout_aux_100_km` |
| `pct` | `sensor.<vehicule>_derniere_charge_part_de_batterie` |
| `lastEnergy` | `sensor.<vehicule>_derniere_charge_energie` |
| `lastCost` | `sensor.<vehicule>_derniere_charge_cout` |
| `lastCharger` | `sensor.<vehicule>_derniere_charge_borne` |
| `odometer` | `sensor.<vehicule>_odometre_derniere_charge` |
| `kmSince` | `sensor.<vehicule>_km_depuis_la_charge_precedente` |
| `capacity` | `sensor.<vehicule>_capacite_batterie` |

Exemple de remplacement :

```yaml
type: custom:ocpp-charger-card
entity: sensor.borne_xxx_connecteur_1_statut
entities:
  online: binary_sensor.ma_borne_en_ligne
```
