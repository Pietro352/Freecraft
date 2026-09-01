(function (global) {
    'use strict';

    global.FreecrafterReleases = [
        {
            version: '1.4.1',
            date: '23 AGOSTO 2026',
            title: 'LA PAGINA NON SI INGRANDISCE PIU\u2019 DA SOLA',
            changes: [
                'Scrivere da iPhone non sballa pi\u00f9 la schermata. Appena il dito entrava in un campo di testo \u2014 la password, il messaggio in chat, l\u2019ID di un amico \u2014 Safari ingrandiva la pagina per conto suo, e a scrittura finita restava ingrandita: met\u00e0 dei pulsanti finiva fuori dallo schermo e l\u2019unico modo di rimettere tutto a posto era ricaricare.',
                'Lo zoom \u00e8 disattivato su tutto il sito: n\u00e9 il pizzico a due dita n\u00e9 il doppio tocco rapido cambiano pi\u00f9 l\u2019ingrandimento, cos\u00ec l\u2019interfaccia resta sempre della misura giusta anche dentro al gioco.',
                'Il doppio tocco rapido sui pulsanti viene letto come due pressioni e non come una richiesta di ingrandire, quindi i comandi rispondono subito.'
            ],
            hint: 'Le scritte restano grandi come prima: nella versione 1.2.2 erano gi\u00e0 state ingrandite apposta, e i campi di testo sono tenuti alla misura che iPhone considera leggibile. Se una schermata ti \u00e8 rimasta ingrandita da prima di questo aggiornamento, ricarica la pagina una volta sola.'
        },
        {
            version: '1.4.0',
            date: '23 AGOSTO 2026',
            title: 'PARTE PIÙ IN FRETTA, SI INSTALLA E LA CHAT NON PERDE PIÙ MESSAGGI',
            changes: [
                'Nella linguetta del browser adesso c\'è scritto solo FREECRAFT. Prima compariva “Freecraft - Client Integrato”.',
                'Il gioco si scarica una volta sola. Sono 18 MB e finora il browser li ributtava via dopo dieci minuti: chi giocava tutti i giorni se li riscaricava ogni volta. Adesso restano da parte sul dispositivo e le partite successive partono quasi subito, anche con la linea lenta. Quando pubblichiamo un gioco aggiornato se ne accorge da solo e scarica quello nuovo.',
                'Puoi aggiungere Freecraft alla schermata iniziale del telefono e aprirlo come una vera app, con la sua icona a blocco d\'erba e senza la barra degli indirizzi intorno.',
                'Gli aggiornamenti arrivano subito. Prima capitava di restare per un\'ora con la versione vecchia di una schermata anche dopo che avevamo corretto qualcosa; adesso il browser si accorge del cambiamento nell\'istante in cui pubblichiamo.',
                'La chat si apre molto più in fretta, soprattutto se hai parecchie conversazioni: il server preparava la lista chiedendo i dati una conversazione alla volta, adesso li chiede tutti insieme.',
                'Non si perdono più messaggi quando ne arrivano tanti in una volta. Se in un gruppo partiva una raffica di più di venti messaggi mentre non guardavi, quelli in mezzo non venivano mai annunciati: sparivano dalle notifiche. Adesso vengono consegnati tutti, uno scaglione dopo l\'altro.',
                'Segnalare un messaggio serve davvero: quando due persone diverse segnalano lo stesso messaggio, quel messaggio viene nascosto subito a tutti senza aspettare che intervenga qualcuno.',
                'Si può di nuovo ingrandire la pagina con due dita. Lo zoom era bloccato, e per chi fa fatica a leggere le scritte piccole non c\'era modo di aggirarlo.',
                'Si può selezionare e copiare il testo: un messaggio della chat, il tuo codice di recupero, il tuo ID Crafter da mandare a un amico. Prima il dito che trascinava non selezionava niente.',
                'Chi prova a indovinare le password ha vita più dura. Il conteggio dei tentativi si poteva aggirare mandandone tanti nello stesso identico momento, e teneva d\'occhio solo il singolo account invece di guardare anche da dove arrivavano. Le soglie restano larghe: in casa si condivide la stessa linea e nessuno deve trovarsi bloccato per aver sbagliato la password due volte.',
                'Il database si tiene in ordine da solo tutte le notti, buttando via sessioni scadute e conteggi vecchi invece di accumularli per sempre.'
            ],
            hint: 'La prima volta che apri Freecraft dopo questo aggiornamento il gioco si riscarica: è normale, è la copia nuova che viene messa da parte. Dalla volta dopo parte subito.'
        },
        {
            version: '1.3.0',
            date: '23 AGOSTO 2026',
            title: 'SUL TELEFONO I PULSANTI NON COPRONO PIÙ IL GIOCO',
            changes: [
                'Mentre giochi da telefono resta un solo pulsante FREECRAFT: piccolo, semitrasparente e in alto a destra. Il pulsante grande della chat spariva solo su computer, quindi sul telefono restava piantato in basso a destra proprio sopra i comandi di salto e di movimento del gioco.',
                'La chat si apre dallo stesso menu di Impostazioni, Mod, Guida e Novità: prima erano due pulsanti diversi, tutti e due sopra i comandi del gioco.',
                'Il pulsante si può trascinare con un dito dove preferisci e resta lì anche nelle partite successive.',
                'Sulla schermata iniziale il pulsante “Novità” non sembra più scritto due volte: la targhetta “NUOVO” veniva disegnata come un secondo cerchietto e la scritta finiva sopra l\'etichetta. Adesso, quando c\'è qualcosa da leggere, compare solo un quadratino giallo.'
            ],
            hint: 'Se il pulsante ti dà fastidio dov\'è, trascinalo con il dito in un angolo libero: la posizione resta salvata.'
        },
        {
            version: '1.2.9',
            date: '23 AGOSTO 2026',
            title: 'PULSANTI SPOSTATI E LOGO CENTRATO',
            changes: [
                'Il pulsante della chat e quello delle scorciatoie (Impostazioni, Mod, Guida, Novità) non compaiono più sopra al logo FREECRAFT: ora stanno in basso a destra, dove non danno fastidio.',
                'Il logo FREECRAFT nel menu di gioco è centrato sullo schermo: prima seguiva la posizione asimmetrica ereditata da Minecraft, poco visibile con il logo originale ma evidente con il nostro.'
            ],
            hint: 'Se il pulsante della chat resta a metà schermo, ricarica la pagina: probabilmente stavi ancora usando la versione precedente salvata in cache.'
        },
        {
            version: '1.2.8',
            date: '22 AGOSTO 2026',
            title: 'TUTTO IN ITALIANO E PIÙ LEGGERO',
            changes: [
                'Il gioco parte in italiano: menu, opzioni, oggetti, blocchi e messaggi sono tradotti (oltre 3000 voci).',
                'Le scritte negli angoli del menu principale (CREDITS.txt, versione, avvisi di copyright) sono sparite: resta solo il logo FREECRAFT.',
                'Avvio del gioco più leggero: il client non viene più copiato in memoria come testo prima di partire, si carica direttamente.',
                'Menu del launcher più fluido: lo sfondo animato riusa lo stesso sfondo invece di ricrearlo a ogni fotogramma e si ferma quando cambi scheda.',
                'Font, immagini e client restano in cache tra una visita e l\'altra, quindi la seconda apertura è molto più rapida.',
                'Corretto il limite FPS che poteva annullare il fotogramma sbagliato e far scattare l\'immagine.',
                'Corretto lo Sprint automatico che rilasciava i tasti sbagliati e spegneva lo Sneak alternato.',
                'FPS e orologio non tengono più occupata la pagina quando sono spenti.',
                'Corretta la scelta del tasto delle mod: se aprivi due volte “PREMI UN TASTO...” il pannello si mangiava un tasto premuto molto dopo.',
                'Chiudendo i pannelli il cursore non salta più da un punto all\'altro della pagina.',
                'Il suono dei messaggi riusa un solo canale audio invece di aprirne uno nuovo ogni volta.',
                'La chat non interroga più il server appena riduci la finestra o chiudi il pannello: controlla con calma in sottofondo.',
                'Lo sfondo del menu non viene più ridimensionato mentre giochi, quindi la barra degli indirizzi del telefono non causa scatti.',
                'Se un errore si ripete in continuazione viene segnalato una volta sola, senza rallentare la pagina.',
                'Corretta la richiesta di “schermo sempre acceso” che in rari casi poteva restare appesa due volte.'
            ],
            hint: 'Chi ha già giocato e aveva scelto l\'inglese resta in inglese: puoi passare all\'italiano da Opzioni... > Lingua.'
        },
        {
            version: '1.2.7',
            date: '22 AGOSTO 2026',
            title: 'SCHERMO NERO RISOLTO',
            changes: [
                'Il gioco riparte normalmente: la versione precedente restava nera dopo il caricamento del client.',
                'Il logo FREECRAFT nel menu principale è rimasto al suo posto.'
            ],
            hint: 'Salvando il nuovo logo era andata persa una riga di codice che avviava il gioco: ora è protetta da un controllo automatico.'
        },
        {
            version: '1.2.6',
            date: '22 AGOSTO 2026',
            title: 'LOGO FREECRAFT DENTRO IL GIOCO',
            changes: [
                'Il logo del menu principale del gioco non è più quello di Minecraft: ora è il marchio FREECRAFT del launcher.',
                'Il logo è stato scritto dentro il pacchetto grafico del client, quindi appare da subito e resta anche dopo un aggiornamento della pagina.'
            ],
            hint: 'I tentativi precedenti agivano solo sulla pagina web e il gioco continuava a disegnare la sua texture: adesso la texture stessa è stata sostituita.'
        },
        {
            version: '1.2.5',
            date: '22 AGOSTO 2026',
            title: 'LOGO DEL MENU SOSTITUITO DAVVERO',
            changes: [
                'La texture Minecraft della schermata mostrata in foto viene ora sostituita direttamente con il logo FREECRAFT del launcher.',
                'La precedente sovrapposizione HTML è stata rimossa: il nuovo logo viene disegnato dal gioco nella posizione originale.'
            ],
            hint: 'La sostituzione agisce sulla texture WebGL del menu principale, senza aggiungere elementi sopra la pagina.'
        },
        {
            version: '1.2.4',
            date: '22 AGOSTO 2026',
            title: 'LOGO FREECRAFT CORRETTO',
            changes: [
                'Il logo FREECRAFT ora compare quando il menu iniziale del gioco è realmente pronto, senza dipendere dal caricamento della pagina.',
                'Le scritte visibili che riportavano Freecrafter sono state uniformate al nome FREECRAFT.'
            ],
            hint: 'Le chiavi tecniche interne sono rimaste invariate per conservare impostazioni, sessioni e preferenze già salvate.'
        },
        {
            version: '1.2.3',
            date: '22 AGOSTO 2026',
            title: 'NUOVO LOGO NEL MENU DEL GIOCO',
            changes: [
                'Nella schermata iniziale del gioco il logo Minecraft è stato sostituito dal logo FREECRAFT usato nel launcher.',
                'Il logo viene nascosto automaticamente quando inizi a giocare, così non copre la partita.'
            ],
            hint: 'Il marchio ora resta coerente tra il launcher e la schermata iniziale di FREECRAFT.'
        },
        {
            version: '1.2.2',
            date: '22 AGOSTO 2026',
            title: 'TESTI PIÙ GRANDI E LEGGIBILI',
            changes: [
                'Le scritte del launcher, dei pannelli e di CraftChat sono state ingrandite in modo uniforme.',
                'Su telefono la dimensione del testo aumenta ulteriormente per facilitare la lettura.',
                'Le etichette più piccole, i badge e i comandi della chat ora risultano più chiari.'
            ],
            hint: 'Puoi rileggere questa modifica in qualsiasi momento premendo il pulsante “i” Novità.'
        },
        {
            version: '1.2.1',
            date: '21 AGOSTO 2026',
            title: 'MOBILE PIÙ LEGGIBILE E SFONDO RIPRISTINATO',
            changes: [
                'Lo sfondo animato resta attivo anche usando il preset mobile.',
                'Le scritte di launcher, guida, impostazioni e CraftChat sono più grandi sui telefoni.',
                'La Guida si apre automaticamente soltanto alla prima visita e resta poi disponibile dal pulsante Guida.'
            ],
            hint: 'Le preferenze già salvate sui dispositivi touch vengono aggiornate una sola volta per ripristinare l’animazione.'
        },
        {
            version: '1.2.0',
            date: '21 AGOSTO 2026',
            title: 'SICUREZZA, CHAT E AVVIO MIGLIORATI',
            changes: [
                'Caricamento del gioco con avanzamento reale e messaggi affidabili.',
                'Codice di recupero monouso, sessioni più brevi e protezione dai tentativi ripetuti.',
                'Blocco utenti, segnalazioni ed eliminazione dei propri messaggi.',
                'Chat ordinate per attività, anteprima, non letti e cronologia paginata.',
                'Nuovo tutorial iniziale e preset automatico per telefono.',
                'Le mod JavaScript personalizzate sono state rimosse per proteggere account e salvataggi.',
                'Monitoraggio anonimo degli errori e test automatici delle funzioni di sicurezza.'
            ],
            hint: 'Apri sempre il pulsante “i” per rileggere tutte le modifiche.'
        },
        {
            version: '1.1.1',
            date: '20 AGOSTO 2026',
            title: 'CRAFTING MOBILE: STACK DIVISIBILI',
            changes: ['Su telefono puoi dividere uno stack a metà toccando due volte rapidamente lo stesso slot.'],
            hint: 'La correzione usa il clic destro del gioco e non modifica i controlli su computer.'
        }
    ];
})(window);
