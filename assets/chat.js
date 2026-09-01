(() => {
    'use strict';

    const SESSION_KEY = 'freecrafter_chat_session';
    const state = {
        token: localStorage.getItem(SESSION_KEY), authenticated: false, profile: null,
        friends: [], blockedUsers: [], conversations: [], currentId: null,
        messages: [], nextCursor: null, hasMore: false, pollTimer: null,
        updatesSince: null, pollBusy: false
    };
    const byId = (id) => document.getElementById(id);
    const trigger = byId('chat-trigger');
    const panel = byId('craft-chat');
    const authScreen = byId('auth-screen');
    const chatApp = byId('chat-app');
    const notice = byId('chat-notice');
    const messageBanner = byId('chat-message-banner');
    // In partita, sul telefono, la chat si apre da questa voce del menu rapido:
    // il pulsante grande coprirebbe i comandi touch del gioco.
    const quickChat = byId('fc-quick-chat');
    let noticeTimer;
    let messageBannerTimer;
    let messageBannerHideTimer;

    const api = async (url, options = {}) => {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (state.token) headers.Authorization = `Bearer ${state.token}`;
        const response = await fetch(url, { ...options, headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/recover')) setLoggedOut();
            throw new Error(data.error || 'Operazione non riuscita.');
        }
        return data;
    };

    const showNotice = (message, error = false) => {
        clearTimeout(noticeTimer);
        notice.textContent = message;
        notice.classList.toggle('is-error', error);
        notice.classList.add('is-visible');
        noticeTimer = setTimeout(() => notice.classList.remove('is-visible'), 3800);
    };

    const setPanelOpen = (open) => {
        panel.classList.toggle('is-open', open);
        panel.setAttribute('aria-hidden', String(!open));
        trigger.setAttribute('aria-expanded', String(open));
        if (open && state.currentId) loadMessages({ silent: true });
        if (!open) window.focusGameFrame?.();
        // Aprendo la chat conviene aggiornare subito; chiudendola basta tornare
        // al ritmo lento, senza sparare un'altra richiesta.
        schedulePoll(open ? 100 : undefined);
    };

    const chatSetting = (key) => window.FreecrafterConfig ? window.FreecrafterConfig.settings[key] : true;

    let audioContext = null;
    const playMessageSound = () => {
        if (!chatSetting('chatSound')) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            // Un solo contesto audio, riusato: aprirne uno per ogni messaggio
            // significava allocare ogni volta una pipeline audio nuova, e i
            // browser ne concedono solo una manciata per pagina.
            if (!audioContext) audioContext = new AudioContextClass();
            const context = audioContext;
            if (context.state === 'suspended') context.resume().catch(() => {});
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(880, context.currentTime);
            oscillator.frequency.setValueAtTime(1174, context.currentTime + 0.09);
            gain.gain.setValueAtTime(0.05, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.24);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        } catch {}
    };

    const hideMessageBanner = () => {
        clearTimeout(messageBannerTimer);
        clearTimeout(messageBannerHideTimer);
        messageBanner.classList.remove('is-visible');
        messageBanner.hidden = true;
    };

    const showMessageBanner = (message, count) => {
        playMessageSound();
        if (!chatSetting('chatBanners')) return;
        clearTimeout(messageBannerTimer);
        clearTimeout(messageBannerHideTimer);
        byId('chat-message-banner-title').textContent = count > 1 ? `${count} NUOVI MESSAGGI` : `MESSAGGIO DA ${message.senderName.toUpperCase()}`;
        byId('chat-message-banner-text').textContent = message.body;
        messageBanner.hidden = false;
        requestAnimationFrame(() => messageBanner.classList.add('is-visible'));
        messageBannerTimer = setTimeout(() => {
            messageBanner.classList.remove('is-visible');
            messageBannerHideTimer = setTimeout(() => { messageBanner.hidden = true; }, 220);
        }, 5200);
    };

    const setBusy = (form, busy) => {
        const button = form.querySelector('.pixel-button[type="submit"]');
        if (!button) return;
        button.disabled = busy;
        button.dataset.label ||= button.textContent;
        button.textContent = busy ? 'ATTENDI...' : button.dataset.label;
    };

    const clearPolling = () => {
        clearTimeout(state.pollTimer);
        state.pollTimer = null;
    };

    const setLoggedOut = () => {
        state.token = null;
        state.authenticated = false;
        state.profile = null;
        state.friends = [];
        state.blockedUsers = [];
        state.conversations = [];
        state.currentId = null;
        state.messages = [];
        localStorage.removeItem(SESSION_KEY);
        clearPolling();
        state.updatesSince = null;
        byId('conversation-view').hidden = true;
        byId('conversation-list').replaceChildren();
        byId('message-list').replaceChildren();
        authScreen.hidden = false;
        chatApp.hidden = true;
        trigger.querySelector('.chat-trigger__label').textContent = 'ACCEDI';
    };

    const setLoggedIn = async (profile, token) => {
        if (token) {
            state.token = token;
            localStorage.setItem(SESSION_KEY, token);
        }
        state.authenticated = true;
        state.profile = profile;
        authScreen.hidden = true;
        chatApp.hidden = false;
        byId('profile-name').textContent = profile.displayName;
        byId('profile-code').textContent = profile.friendCode;
        trigger.querySelector('.chat-trigger__label').textContent = 'CHAT';
        await loadBootstrap();
        state.updatesSince = null;
        schedulePoll(100);
    };

    const showRecoveryCode = (code) => {
        byId('recovery-code').textContent = code;
        byId('recovery-dialog').showModal();
    };

    const initials = (name) => String(name || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const conversationName = (conversation) => {
        if (conversation.isGroup) return conversation.name || 'Gruppo';
        return conversation.members.find((member) => member.id !== state.profile.identityId)?.displayName || 'Chat';
    };
    const directTarget = (conversation) => conversation?.isGroup ? null : conversation?.members.find((member) => member.id !== state.profile.identityId);
    const formatTime = (value) => new Intl.DateTimeFormat('it', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

    const updateUnreadBadge = () => {
        const unread = state.conversations.reduce((total, conversation) => total + Number(conversation.unreadCount || 0), 0);
        trigger.classList.toggle('has-unread', unread > 0);
        trigger.setAttribute('aria-label', unread ? `Apri CraftChat, ${unread} messaggi non letti` : 'Apri CraftChat');
        if (quickChat) {
            quickChat.classList.toggle('has-unread', unread > 0);
            quickChat.setAttribute('aria-label', unread ? `Apri CraftChat, ${unread} messaggi non letti` : 'Apri CraftChat');
        }
    };

    const renderConversations = () => {
        const list = byId('conversation-list');
        list.replaceChildren();
        if (!state.conversations.length) {
            const empty = document.createElement('div');
            empty.className = 'list-empty';
            empty.innerHTML = '<strong>NESSUNA CHAT</strong>Aggiungi un ID Crafter per iniziare.';
            list.appendChild(empty);
            updateUnreadBadge();
            return;
        }
        state.conversations.forEach((conversation) => {
            const name = conversationName(conversation);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'list-item';
            button.dataset.conversationId = conversation.id;
            const avatar = document.createElement('span');
            avatar.className = 'list-avatar';
            avatar.textContent = conversation.isGroup ? 'G' : initials(name);
            const copy = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = name;
            const preview = document.createElement('small');
            preview.textContent = conversation.latestMessage?.body || (conversation.isGroup ? `${conversation.members.length} membri` : 'Chat privata');
            copy.append(title, preview);
            const meta = document.createElement('span');
            meta.className = 'list-meta';
            if (conversation.latestMessage) {
                const time = document.createElement('small');
                time.textContent = formatTime(conversation.latestMessage.createdAt);
                meta.appendChild(time);
            }
            if (conversation.unreadCount) {
                const badge = document.createElement('b');
                badge.className = 'unread-badge';
                badge.textContent = conversation.unreadCount > 99 ? '99+' : String(conversation.unreadCount);
                meta.appendChild(badge);
            }
            button.append(avatar, copy, meta);
            list.appendChild(button);
        });
        updateUnreadBadge();
    };

    const renderFriends = () => {
        const list = byId('group-friends');
        list.replaceChildren();
        state.friends.forEach((friend) => {
            const label = document.createElement('label');
            label.className = 'group-friend';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'memberId';
            input.value = friend.id;
            label.append(input, document.createTextNode(friend.displayName));
            list.appendChild(label);
        });
    };

    const renderBlockedUsers = () => {
        const list = byId('blocked-users');
        list.replaceChildren();
        if (!state.blockedUsers.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Nessun utente bloccato.';
            list.appendChild(empty);
            return;
        }
        state.blockedUsers.forEach((user) => {
            const row = document.createElement('div');
            row.className = 'blocked-user';
            const name = document.createElement('span');
            name.textContent = user.displayName;
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.unblockId = user.id;
            button.textContent = 'SBLOCCA';
            row.append(name, button);
            list.appendChild(row);
        });
    };

    const loadBootstrap = async () => {
        const data = await api('/api/chat?action=bootstrap');
        state.friends = data.friends || [];
        state.blockedUsers = data.blockedUsers || [];
        state.conversations = data.conversations || [];
        renderConversations();
        renderFriends();
        renderBlockedUsers();
    };

    const messageNode = (message) => {
        const article = document.createElement('article');
        const own = message.senderId === state.profile.identityId;
        article.className = `message${own ? ' is-own' : ''}${message.deletedAt || message.hidden ? ' is-muted' : ''}`;
        article.dataset.messageId = message.id;
        const meta = document.createElement('div');
        meta.className = 'message__meta';
        const sender = document.createElement('span');
        sender.textContent = own ? 'TU' : message.senderName;
        const time = document.createElement('time');
        time.textContent = formatTime(message.createdAt);
        meta.append(sender, time);
        const text = document.createElement('p');
        text.textContent = message.body;
        article.append(meta, text);
        if (!message.deletedAt && !message.hidden) {
            const actions = document.createElement('div');
            actions.className = 'message__actions';
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.messageAction = own ? 'delete' : 'report';
            button.textContent = own ? 'ELIMINA' : 'SEGNALA';
            actions.appendChild(button);
            article.appendChild(actions);
        }
        return article;
    };

    const renderMessages = (messagesToRender, prepend = false) => {
        const list = byId('message-list');
        if (!prepend) list.replaceChildren();
        if (!messagesToRender.length && !prepend) {
            const empty = document.createElement('div');
            empty.className = 'message-empty';
            empty.textContent = 'Ancora nessun messaggio. Scrivi la prima pagina.';
            list.appendChild(empty);
            return;
        }
        const fragment = document.createDocumentFragment();
        messagesToRender.forEach((message) => fragment.appendChild(messageNode(message)));
        if (prepend) list.prepend(fragment);
        else list.appendChild(fragment);
    };

    const markRead = async () => {
        if (!state.currentId) return;
        await api('/api/chat?action=read', { method: 'POST', body: JSON.stringify({ conversationId: state.currentId }) });
        const conversation = state.conversations.find((item) => item.id === state.currentId);
        if (conversation) conversation.unreadCount = 0;
        renderConversations();
    };

    const loadMessages = async ({ older = false, silent = false } = {}) => {
        if (!state.currentId || (older && !state.hasMore)) return;
        try {
            const list = byId('message-list');
            const previousHeight = list.scrollHeight;
            const before = older && state.nextCursor ? `&before=${encodeURIComponent(state.nextCursor)}` : '';
            const data = await api(`/api/chat?action=messages&conversationId=${encodeURIComponent(state.currentId)}${before}`);
            if (older) {
                state.messages = [...data.messages, ...state.messages];
                renderMessages(data.messages, true);
                list.scrollTop += list.scrollHeight - previousHeight;
            } else {
                state.messages = data.messages;
                renderMessages(state.messages);
                list.scrollTop = list.scrollHeight;
                markRead().catch(() => {});
            }
            state.hasMore = Boolean(data.hasMore);
            state.nextCursor = data.nextCursor;
            byId('load-older').hidden = !state.hasMore;
        } catch (error) {
            if (!silent) showNotice(error.message, true);
        }
    };

    const openConversation = async (id) => {
        state.currentId = id;
        const conversation = state.conversations.find((item) => item.id === id);
        if (!conversation) return;
        const name = conversationName(conversation);
        const target = directTarget(conversation);
        byId('conversation-title').textContent = name;
        byId('conversation-avatar').textContent = conversation.isGroup ? 'G' : initials(name);
        byId('conversation-meta').textContent = conversation.isGroup ? `${conversation.members.length} membri` : 'Chat privata';
        byId('conversation-safety').hidden = !target;
        byId('conversation-safety').dataset.profileId = target?.id || '';
        byId('conversation-view').hidden = false;
        state.messages = [];
        state.nextCursor = null;
        state.hasMore = false;
        await loadMessages();
    };

    // Restituisce true quando il server segnala che c'e' altro da leggere oltre
    // ai messaggi appena consegnati: chi ha scritto una risposta poteva vedersela
    // comparire con un ritardo di parecchi secondi.
    const checkNotifications = async () => {
        if (!state.authenticated || state.pollBusy) return false;
        state.pollBusy = true;
        let pending = false;
        try {
            const after = state.updatesSince ? `&after=${encodeURIComponent(state.updatesSince)}` : '';
            const data = await api(`/api/chat?action=updates${after}`);
            state.updatesSince = data.checkedAt;
            pending = data.more === true;
            if (!data.messages.length) return pending;
            await loadBootstrap();
            if (state.currentId && panel.classList.contains('is-open') && data.messages.some((message) => message.conversationId === state.currentId)) {
                await loadMessages({ silent: true });
            }
            const bannerMessages = data.messages.filter((message) => !panel.classList.contains('is-open') || message.conversationId !== state.currentId);
            if (bannerMessages.length) showMessageBanner(bannerMessages.at(-1), bannerMessages.length);
        } catch {} finally {
            state.pollBusy = false;
        }
        return pending;
    };

    const schedulePoll = (delay) => {
        clearPolling();
        if (!state.authenticated) return;
        const nextDelay = delay ?? (document.hidden ? 30000 : panel.classList.contains('is-open') ? 6000 : 12000);
        state.pollTimer = setTimeout(async () => {
            // Il server consegna al massimo 20 messaggi per volta. Se ne ha
            // lasciati indietro non aspettiamo il giro normale: ripartiamo
            // subito da dove eravamo, finche' non siamo in pari.
            const pending = await checkNotifications();
            schedulePoll(pending ? 400 : undefined);
        }, nextDelay);
    };

    // Tornando sulla scheda vale la pena aggiornare subito; andandosene no:
    // si riprogramma soltanto il controllo lento di sottofondo.
    document.addEventListener('visibilitychange', () => schedulePoll(document.hidden ? undefined : 200));
    trigger.addEventListener('click', () => setPanelOpen(!panel.classList.contains('is-open')));
    // Usata dal menu rapido sopra il gioco (assets/launcher-effects.js).
    window.FreecrafterChat = {
        open: () => setPanelOpen(true),
        close: () => setPanelOpen(false),
        toggle: () => setPanelOpen(!panel.classList.contains('is-open'))
    };
    byId('chat-close').addEventListener('click', () => setPanelOpen(false));
    messageBanner.addEventListener('click', () => { setPanelOpen(true); hideMessageBanner(); });
    byId('conversation-list').addEventListener('click', (event) => {
        const button = event.target.closest('[data-conversation-id]');
        if (button) openConversation(button.dataset.conversationId);
    });
    byId('load-older').addEventListener('click', () => loadMessages({ older: true }));

    document.querySelectorAll('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => {
        document.querySelectorAll('[data-auth-tab]').forEach((item) => {
            const active = item === tab;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('[data-auth-panel]').forEach((form) => form.classList.toggle('is-active', form.dataset.authPanel === tab.dataset.authTab));
    }));

    const submitAuth = (action) => async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        setBusy(form, true);
        try {
            const data = await api(`/api/auth/${action}`, { method: 'POST', body: JSON.stringify(values) });
            form.reset();
            await setLoggedIn(data.profile, data.token);
            if (data.recoveryCode) showRecoveryCode(data.recoveryCode);
            showNotice(action === 'signup' ? 'ACCOUNT CREATO!' : action === 'recover' ? 'ACCOUNT RECUPERATO!' : 'ACCESSO EFFETTUATO!');
        } catch (error) { showNotice(error.message, true); }
        finally { setBusy(form, false); }
    };
    byId('login-form').addEventListener('submit', submitAuth('login'));
    byId('signup-form').addEventListener('submit', submitAuth('signup'));
    byId('recover-form').addEventListener('submit', submitAuth('recover'));

    byId('logout-button').addEventListener('click', async () => {
        try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
        setLoggedOut();
        showNotice('SEI USCITO DALL’ACCOUNT.');
    });
    byId('copy-code').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(state.profile.friendCode); showNotice('ID COPIATO!'); }
        catch { showNotice(`IL TUO ID: ${state.profile.friendCode}`); }
    });
    byId('copy-recovery').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(byId('recovery-code').textContent); showNotice('CODICE COPIATO!'); }
        catch { showNotice('Annota il codice prima di chiudere.', true); }
    });
    byId('conversation-back').addEventListener('click', () => {
        byId('conversation-view').hidden = true;
        state.currentId = null;
    });

    byId('add-friend').addEventListener('click', () => byId('friend-dialog').showModal());
    byId('friend-form').addEventListener('submit', async (event) => {
        if (event.submitter?.value === 'cancel') return;
        event.preventDefault();
        const form = event.currentTarget;
        const friendCode = new FormData(form).get('friendCode');
        setBusy(form, true);
        try {
            const data = await api('/api/chat?action=friend', { method: 'POST', body: JSON.stringify({ friendCode }) });
            byId('friend-dialog').close();
            form.reset();
            const direct = await api('/api/chat?action=direct', { method: 'POST', body: JSON.stringify({ friendId: data.friend.id }) });
            await loadBootstrap();
            await openConversation(direct.conversation.id);
            showNotice('CHAT CREATA!');
        } catch (error) { showNotice(error.message, true); }
        finally { setBusy(form, false); }
    });

    byId('new-group').addEventListener('click', () => {
        if (!state.friends.length) { showNotice('AGGIUNGI PRIMA UN ID.', true); return; }
        byId('group-dialog').showModal();
    });
    byId('group-form').addEventListener('submit', async (event) => {
        if (event.submitter?.value === 'cancel') return;
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setBusy(form, true);
        try {
            const result = await api('/api/chat?action=group', { method: 'POST', body: JSON.stringify({ name: formData.get('name'), memberIds: formData.getAll('memberId') }) });
            byId('group-dialog').close();
            form.reset();
            await loadBootstrap();
            await openConversation(result.conversation.id);
            showNotice('GRUPPO CREATO!');
        } catch (error) { showNotice(error.message, true); }
        finally { setBusy(form, false); }
    });

    byId('message-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.message;
        const body = input.value.trim();
        if (!body || !state.currentId) return;
        input.value = '';
        try {
            await api('/api/chat?action=message', { method: 'POST', body: JSON.stringify({ conversationId: state.currentId, body }) });
            await loadBootstrap();
            await loadMessages({ silent: true });
        } catch (error) { input.value = body; showNotice(error.message, true); }
    });

    byId('message-list').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-message-action]');
        if (!button) return;
        const messageId = button.closest('[data-message-id]').dataset.messageId;
        if (button.dataset.messageAction === 'delete') {
            if (!confirm('Eliminare questo messaggio?')) return;
            try {
                await api('/api/chat?action=delete-message', { method: 'POST', body: JSON.stringify({ messageId }) });
                await loadMessages({ silent: true });
                await loadBootstrap();
            } catch (error) { showNotice(error.message, true); }
        } else {
            byId('report-form').elements.messageId.value = messageId;
            byId('report-dialog').showModal();
        }
    });

    byId('report-form').addEventListener('submit', async (event) => {
        if (event.submitter?.value === 'cancel') return;
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        setBusy(form, true);
        try {
            await api('/api/chat?action=report', { method: 'POST', body: JSON.stringify(values) });
            byId('report-dialog').close();
            showNotice('SEGNALAZIONE INVIATA.');
        } catch (error) { showNotice(error.message, true); }
        finally { setBusy(form, false); }
    });

    byId('conversation-safety').addEventListener('click', async (event) => {
        const profileId = event.currentTarget.dataset.profileId;
        const conversation = state.conversations.find((item) => item.id === state.currentId);
        if (!profileId || !confirm(`Bloccare ${conversationName(conversation)}? La chat verrà nascosta.`)) return;
        try {
            await api('/api/chat?action=block', { method: 'POST', body: JSON.stringify({ profileId }) });
            byId('conversation-view').hidden = true;
            state.currentId = null;
            await loadBootstrap();
            showNotice('UTENTE BLOCCATO.');
        } catch (error) { showNotice(error.message, true); }
    });

    byId('chat-security').addEventListener('click', () => {
        renderBlockedUsers();
        byId('security-dialog').showModal();
    });
    byId('blocked-users').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-unblock-id]');
        if (!button) return;
        try {
            await api('/api/chat?action=unblock', { method: 'POST', body: JSON.stringify({ profileId: button.dataset.unblockId }) });
            await loadBootstrap();
            showNotice('UTENTE SBLOCCATO.');
        } catch (error) { showNotice(error.message, true); }
    });

    byId('password-form').addEventListener('submit', async (event) => {
        if (event.submitter?.value !== 'change') return;
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        setBusy(form, true);
        try {
            const data = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify(values) });
            byId('security-dialog').close();
            form.reset();
            await setLoggedIn(data.profile, data.token);
            showRecoveryCode(data.recoveryCode);
            showNotice('PASSWORD CAMBIATA.');
        } catch (error) { showNotice(error.message, true); }
        finally { setBusy(form, false); }
    });

    (async () => {
        if (!state.token) { setLoggedOut(); return; }
        try {
            const data = await api('/api/auth/session');
            if (data.profile) await setLoggedIn(data.profile);
            else setLoggedOut();
        } catch { setLoggedOut(); }
    })();
})();
