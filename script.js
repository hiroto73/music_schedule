document.addEventListener('DOMContentLoaded', () => {

    // ===== DOM要素の取得 =====
    const screens = {
        login: document.getElementById('login-screen'),
        main: document.getElementById('main-screen'),
        scheduleInput: document.getElementById('schedule-input-screen'),
    };
    const passwordToggles = document.querySelectorAll('.password-toggle-btn');
    // ... 他の多くの要素も同様に取得 ...

    // ===== アプリケーションの状態管理 =====
    let state = {
        currentUser: null, // { email, password, nickname, circleCode }
        allData: {},       // LocalStorageから読み込んだ全データ
        currentSongId: null, // 表示中の曲のID
        confirmingSlots: [], // 確定中のスロット
    };

    // ===== 定数 =====
    const PERIODS = ['1限', '昼', '2限', '3限', '4限', '5限', '6限', '7限'];
    const EQUIPMENT_STOCK = { 'ベーアン': 3, 'キーボード': 3, 'スプラッシュ': 3, 'ハイハット': 3 };

    // ===== データ管理（LocalStorage）=====
    const dataManager = {
        load: () => {
            const data = localStorage.getItem('liveScheduleApp');
            state.allData = data ? JSON.parse(data) : { users: {}, songs: {} };
        },
        save: () => {
            localStorage.setItem('liveScheduleApp', JSON.stringify(state.allData));
        },
        getUser: (email) => state.allData.users[email],
        setUser: (user) => {
            state.allData.users[user.email] = user;
            dataManager.save();
        },
        getSong: (songId) => state.allData.songs[songId],
        setSong: (song) => {
            state.allData.songs[song.id] = song;
            dataManager.save();
        },
        deleteSong: (songId) => {
            delete state.allData.songs[songId];
            dataManager.save();
        }
    };


    // ===== 初期化処理 =====
    function init() {
        dataManager.load();
        
        // ログイン状態を確認
        const loggedInUserEmail = localStorage.getItem('loggedInUser');
        if (loggedInUserEmail) {
            state.currentUser = dataManager.getUser(loggedInUserEmail);
        }

        handleRouting();
        setupEventListeners();
    }

    // ===== 画面遷移（ルーティング）=====
    function showScreen(screenName) {
        Object.values(screens).forEach(s => s.style.display = 'none');
        if (screens[screenName]) {
            screens[screenName].style.display = 'block';
        }
    }

    function handleRouting() {
        const params = new URLSearchParams(window.location.search);
        const songIdFromUrl = params.get('id');

        if (!state.currentUser) {
            showScreen('login');
            return;
        }

        if (songIdFromUrl) {
            // URLに曲IDがあれば、空きコマ入力画面へ
            importSongFromUrl(params);
            state.currentSongId = songIdFromUrl;
            showScheduleInputScreen();
        } else {
            // なければメイン画面へ
            showMainScreen();
        }
    }
    
    // URLから曲情報をインポートする
    function importSongFromUrl(params) {
        const songId = params.get('id');
        if (!songId || dataManager.getSong(songId)) {
            // 既に存在する場合は何もしない
            return;
        }

        // 新規曲としてLocalStorageに保存
        const newSong = {
            id: songId,
            creatorNickname: params.get('creator'),
            circleCode: params.get('circle'),
            songTitle: decodeURIComponent(params.get('song')),
            startDate: params.get('start'),
            endDate: params.get('end'),
            participants: [],
            availability: {},
            confirmed: [],
        };
        dataManager.setSong(newSong);
    }


    // ===== UI更新関数 =====

    /** メイン画面の表示 */
    function showMainScreen() {
        showScreen('main');
        const songListContainer = document.getElementById('song-list-container');
        songListContainer.innerHTML = '';
        
        const user = state.currentUser;
        const today = new Date().toISOString().split('T')[0];

        const filteredSongs = Object.values(state.allData.songs).filter(song =>
            song.circleCode === user.circleCode &&
            (song.creatorNickname === user.nickname || (song.participants && song.participants.includes(user.nickname))) &&
            new Date(song.endDate) >= new Date(today)
        );

        if (filteredSongs.length === 0) {
            songListContainer.innerHTML = `<p class="no-songs-message">参加中の曲はありません。<br>右下の「+」ボタンから新しい練習日程を作成するか、共有されたリンクを開いてください。</p>`;
            return;
        }

        filteredSongs.forEach(song => {
            const item = document.createElement('div');
            item.className = 'song-item';
            item.dataset.songId = song.id;
            
            let creatorInfo = `作成者: ${song.creatorNickname}`;
            if (song.creatorNickname === user.nickname) {
                creatorInfo += ' (あなた)';
            }
            
            item.innerHTML = `
                <div class="song-item-info">
                    <h3>${song.songTitle}</h3>
                    <p>${creatorInfo} | 期間: ${song.startDate} ~ ${song.endDate}</p>
                </div>
                ${song.creatorNickname === user.nickname ? '<button class="song-item-delete-btn">⋮</button>' : ''}
            `;
            songListContainer.appendChild(item);
        });
    }

    /** 空きコマ入力画面の表示 */
    function showScheduleInputScreen() {
        showScreen('scheduleInput');
        const song = dataManager.getSong(state.currentSongId);
        if (!song) {
            alert('曲が見つかりません。メイン画面に戻ります。');
            window.location.search = ''; // URLパラメータを消してリロード
            return;
        }

        // 曲情報を表示
        document.getElementById('schedule-song-title').textContent = song.songTitle;
        document.getElementById('schedule-circle-code').textContent = song.circleCode;
        document.getElementById('schedule-nickname').textContent = state.currentUser.nickname;
        
        // グリッドを生成
        generateScheduleGrid(song);

        // 確定済みコマを表示
        renderConfirmedPractices(song);

        // 確定機能の表示制御
        const isCreator = song.creatorNickname === state.currentUser.nickname;
        document.getElementById('confirmation-controls').style.display = isCreator ? 'block' : 'none';
        document.getElementById('confirmation-unavailable-msg').style.display = isCreator ? 'none' : 'block';

        // 参加者リストに追加
        if (!song.participants.includes(state.currentUser.nickname)) {
            song.participants.push(state.currentUser.nickname);
            dataManager.setSong(song);
        }
    }

    /** 日程グリッドの生成 */
    function generateScheduleGrid(song) {
        const container = document.getElementById('schedule-grid-container');
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.id = 'schedule-grid';

        const dates = getDatesInRange(song.startDate, song.endDate);
        grid.style.gridTemplateColumns = `auto repeat(${dates.length}, 1fr)`;
        
        // ヘッダー行（日付）
        grid.innerHTML += `<div class="grid-header grid-period-header"></div>`; // 左上の空セル
        dates.forEach(date => {
            grid.innerHTML += `<div class="grid-header">${formatDate(date)}</div>`;
        });

        // データ行（時限ごと）
        const userAvailability = song.availability[state.currentUser.nickname] || [];
        
        PERIODS.forEach(period => {
            let rowHtml = `<div class="grid-header grid-period-header">${period}</div>`;
            dates.forEach(date => {
                const cellId = `${date.toISOString().split('T')[0]}_${period}`;
                const totalParticipants = Object.values(song.availability)
                    .filter(avail => avail.includes(cellId)).length;
                
                const isSelected = userAvailability.includes(cellId);
                const isConfirmed = isSlotConfirmed(song, cellId);

                rowHtml += `
                    <div class="grid-cell ${isSelected ? 'selected' : ''} ${isConfirmed ? 'disabled' : ''}" data-cell-id="${cellId}">
                        <div class="cell-content">
                            <span class="participant-count">${totalParticipants > 0 ? totalParticipants : ''}</span>
                        </div>
                        ${totalParticipants > 0 ? `<button class="cell-menu-btn" data-cell-id="${cellId}">･･･</button>`: ''}
                    </div>
                `;
            });
            rowHtml += ``;
            grid.innerHTML += rowHtml;
        });
        container.appendChild(grid);
    }
    
    /** 確定済みコマの表示 */
    function renderConfirmedPractices(song) {
        const container = document.getElementById('confirmed-practices-container');
        container.innerHTML = '';

        const groupedByDate = song.confirmed.reduce((acc, practice) => {
            (acc[practice.date] = acc[practice.date] || []).push(practice);
            return acc;
        }, {});

        Object.keys(groupedByDate).sort().forEach(date => {
            const dayGroupEl = document.createElement('div');
            dayGroupEl.className = 'confirmed-day-group';
            dayGroupEl.innerHTML = `<h3>${formatDate(new Date(date))}</h3>`;

            groupedByDate[date].forEach(practice => {
                const itemEl = document.createElement('div');
                itemEl.className = 'confirmed-practice-item';
                if (practice.warnings && practice.warnings.length > 0) {
                    itemEl.classList.add('warning');
                }

                itemEl.innerHTML = `
                    <p><strong>時間:</strong> ${practice.periods.join(', ')}</p>
                    <p><strong>部屋:</strong> ${practice.room}</p>
                    <p><strong>機材:</strong> ${practice.equipment.length > 0 ? practice.equipment.join(', ') : 'なし'}</p>
                    <p><strong>参加者:</strong> ${practice.participants.join(', ')}</p>
                    ${(practice.warnings && practice.warnings.length > 0) ? `<div class="warning-message">${practice.warnings.join('<br>')}</div>` : ''}
                `;
                dayGroupEl.appendChild(itemEl);
            });
            container.appendChild(dayGroupEl);
        });
    }


    // ===== イベントリスナー設定 =====
    function setupEventListeners() {
        // パスワード表示切替
        passwordToggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const passwordInput = e.target.previousElementSibling;
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    e.target.textContent = '隠す';
                } else {
                    passwordInput.type = 'password';
                    e.target.textContent = '表示';
                }
            });
        });

        // 登録・ログインフォーム切替
        document.getElementById('show-login-link').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
        });
        document.getElementById('show-register-link').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-form').style.display = 'block';
            document.getElementById('login-form').style.display = 'none';
        });

        // ユーザー登録
        document.getElementById('register-btn').addEventListener('click', handleRegister);
        // ログイン
        document.getElementById('login-btn').addEventListener('click', handleLogin);
        // ログアウト
        document.getElementById('logout-btn').addEventListener('click', handleLogout);

        // ハンバーガーメニュー
        const sidePanel = document.getElementById('side-panel');
        const panelOverlay = document.getElementById('panel-overlay');
        document.getElementById('hamburger-btn').addEventListener('click', () => {
            populateUserInfoPanel();
            sidePanel.classList.add('open');
            panelOverlay.classList.add('active');
        });
        document.getElementById('close-panel-btn').addEventListener('click', closePanel);
        panelOverlay.addEventListener('click', closePanel);

        // ニックネーム保存
        document.getElementById('save-nickname-btn').addEventListener('click', saveNickname);

        // 曲リストのクリック
        document.getElementById('song-list-container').addEventListener('click', (e) => {
            const songItem = e.target.closest('.song-item');
            const deleteBtn = e.target.closest('.song-item-delete-btn');

            if (deleteBtn) {
                // 削除ボタンが押された場合
                const songId = songItem.dataset.songId;
                if (confirm('この練習日程を削除しますか？\n関連するすべてのデータが失われます。')) {
                    dataManager.deleteSong(songId);
                    showMainScreen();
                }
            } else if (songItem) {
                // 曲アイテム自体がクリックされた場合
                state.currentSongId = songItem.dataset.songId;
                const song = dataManager.getSong(state.currentSongId);
                // URLを更新して画面遷移
                const params = new URLSearchParams({
                    id: song.id,
                    song: encodeURIComponent(song.songTitle),
                    circle: song.circleCode,
                    creator: song.creatorNickname,
                    start: song.startDate,
                    end: song.endDate
                });
                history.pushState({}, '', `?${params.toString()}`);
                showScheduleInputScreen();
            }
        });
        
        // 曲作成ボタン(+)
        document.getElementById('add-song-btn').addEventListener('click', () => {
            document.getElementById('create-link-modal').style.display = 'flex';
        });

        // モーダル閉じるボタン
        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal-container').style.display = 'none';
            });
        });

        // リンク作成
        document.getElementById('generate-link-btn').addEventListener('click', generateShareLink);
        // リンクコピー
        document.getElementById('copy-link-btn').addEventListener('click', copyLink);

        // メイン画面へ戻るボタン
        document.getElementById('back-to-main-btn').addEventListener('click', () => {
            history.pushState({}, '', window.location.pathname);
            showMainScreen();
        });
        
        // 空きコマグリッドのクリック
        document.getElementById('schedule-grid-container').addEventListener('click', (e) => {
            const cell = e.target.closest('.grid-cell');
            const menuBtn = e.target.closest('.cell-menu-btn');

            if (menuBtn) {
                // 参加者一覧表示
                showParticipantsModal(menuBtn.dataset.cellId);
            } else if (cell && !cell.classList.contains('disabled')) {
                // 空きコマ選択/解除
                const isConfirmMode = document.getElementById('confirmation-controls').style.display === 'block' &&
                                  document.querySelector('.action-buttons').style.display === 'none';

                if(isConfirmMode) {
                    // 練習コマ確定モード
                     cell.classList.toggle('confirm-selected');
                } else {
                    // 通常の空きコマ入力モード
                    cell.classList.toggle('selected');
                }
            }
        });
        
        // 空きコマ保存
        document.getElementById('save-schedule-btn').addEventListener('click', saveSchedule);
        
        // 参加者一覧モーダル
        function showParticipantsModal(cellId) {
            const song = dataManager.getSong(state.currentSongId);
            const participants = Object.entries(song.availability)
                .filter(([_, avail]) => avail.includes(cellId))
                .map(([nickname, _]) => nickname);

            const [date, period] = cellId.split('_');
            document.getElementById('participants-modal-title').textContent = `${formatDate(new Date(date))} ${period} の参加予定者`;
            const listEl = document.getElementById('participants-list');
            listEl.innerHTML = participants.length > 0 
                ? participants.map(p => `<li>${p}</li>`).join('') 
                : '<li>参加予定者はいません</li>';
            
            document.getElementById('participants-modal').style.display = 'flex';
        }

        // 練習コマ確定関連
        document.getElementById('show-confirmation-screen-btn').addEventListener('click', showConfirmationScreen);
        document.getElementById('finalize-confirmation-btn').addEventListener('click', finalizeConfirmation);
    }
    
    // ===== イベントハンドラ関数 =====
    
    function handleRegister() {
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const nickname = document.getElementById('register-nickname').value.trim();
        const circleCode = document.getElementById('register-circle-code').value.trim();

        if (!email || !password || !nickname || !circleCode) {
            alert('すべての項目を入力してください。');
            return;
        }
        if (dataManager.getUser(email)) {
            alert('このメールアドレスは既に使用されています。');
            return;
        }

        const newUser = { email, password, nickname, circleCode };
        dataManager.setUser(newUser);
        loginUser(newUser);
    }

    function handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const user = dataManager.getUser(email);

        if (user && user.password === password) {
            loginUser(user);
        } else {
            alert('メールアドレスまたはパスワードが間違っています。');
        }
    }
    
    function loginUser(user) {
        state.currentUser = user;
        localStorage.setItem('loggedInUser', user.email);
        handleRouting();
    }

    function handleLogout() {
        state.currentUser = null;
        localStorage.removeItem('loggedInUser');
        closePanel();
        window.location.href = window.location.pathname; // ページをリロードしてログイン画面へ
    }
    
    function populateUserInfoPanel() {
        const user = state.currentUser;
        document.getElementById('info-email').textContent = user.email;
        document.getElementById('info-password').textContent = '•'.repeat(user.password.length);
        document.getElementById('info-password').dataset.password = user.password;
        document.getElementById('info-nickname').value = user.nickname;
        document.getElementById('info-circle-code').textContent = user.circleCode;

        document.getElementById('info-password-toggle').addEventListener('click', e => {
            const p = document.getElementById('info-password');
            if (p.textContent.includes('•')) {
                p.textContent = p.dataset.password;
                e.target.textContent = '隠す';
            } else {
                p.textContent = '•'.repeat(p.dataset.password.length);
                e.target.textContent = '表示';
            }
        });
    }
    
    function saveNickname() {
        const newNickname = document.getElementById('info-nickname').value.trim();
        if (!newNickname) {
            alert('ニックネームは空にできません。');
            return;
        }
        
        // TODO: 他のデータ内のニックネームも更新する必要がある
        // このLocalStorageベースの実装では非常に複雑になるため、今回はユーザー情報のみ更新
        state.currentUser.nickname = newNickname;
        dataManager.setUser(state.currentUser);
        alert('ニックネームを保存しました。');
        closePanel();
        // メイン画面の再描画
        showMainScreen();
    }

    function closePanel() {
        document.getElementById('side-panel').classList.remove('open');
        document.getElementById('panel-overlay').classList.remove('active');
    }

    function generateShareLink() {
        const songTitle = document.getElementById('create-song-title').value.trim();
        const startDate = document.getElementById('create-start-date').value;
        const endDate = document.getElementById('create-end-date').value;
        
        if (!songTitle || !startDate || !endDate) {
            alert('すべての項目を入力してください。');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            alert('終了日は開始日より後に設定してください。');
            return;
        }
        
        const user = state.currentUser;
        // ユニークなIDを生成
        const songId = `${user.circleCode}-${Date.now()}`;
        
        const song = {
            id: songId,
            creatorNickname: user.nickname,
            circleCode: user.circleCode,
            songTitle: songTitle,
            startDate: startDate,
            endDate: endDate,
            participants: [user.nickname], // 作成者も参加者
            availability: {},
            confirmed: [],
        };
        dataManager.setSong(song);

        const params = new URLSearchParams({
            id: song.id,
            song: encodeURIComponent(song.songTitle),
            circle: song.circleCode,
            creator: song.creatorNickname,
            start: song.startDate,
            end: song.endDate
        });
        const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

        document.getElementById('generated-link').value = url;
        document.getElementById('generated-link-container').style.display = 'block';
    }

    function copyLink() {
        const linkText = document.getElementById('generated-link');
        linkText.select();
        document.execCommand('copy');
        alert('リンクをコピーしました！');
    }
    
    function saveSchedule() {
        const song = dataManager.getSong(state.currentSongId);
        const selectedCells = Array.from(document.querySelectorAll('.grid-cell.selected:not(.disabled)'))
                                   .map(cell => cell.dataset.cellId);
        
        song.availability[state.currentUser.nickname] = selectedCells;
        dataManager.setSong(song);
        
        alert('空きコマを保存しました。');
        generateScheduleGrid(song); // 参加人数を更新して再描画
    }

    function showConfirmationScreen() {
        state.confirmingSlots = Array.from(document.querySelectorAll('.grid-cell.confirm-selected'))
            .map(c => c.dataset.cellId);
        
        if (state.confirmingSlots.length === 0) {
            alert('確定するコマを1つ以上選択してください。');
            return;
        }

        // モーダルに選択したコマを表示
        const listEl = document.getElementById('confirm-slot-list');
        listEl.innerHTML = state.confirmingSlots.map(slotId => {
            const [date, period] = slotId.split('_');
            return `<li>${formatDate(new Date(date))} ${period}</li>`;
        }).join('');

        // フォームをリセット
        document.getElementById('confirm-room').value = '';
        document.querySelectorAll('#confirm-equipment input[type="checkbox"]').forEach(cb => cb.checked = false);

        document.getElementById('practice-confirmation-modal').style.display = 'flex';
    }

    function finalizeConfirmation() {
        const room = document.getElementById('confirm-room').value.trim();
        if (!room) {
            alert('練習部屋は必須です。');
            return;
        }
        
        const equipment = Array.from(document.querySelectorAll('#confirm-equipment input:checked'))
                               .map(cb => cb.value);
        
        const song = dataManager.getSong(state.currentSongId);
        const newConfirmedPractices = [];
        
        // コマを日付と時限でグループ化
        const groupedSlots = state.confirmingSlots.reduce((acc, slotId) => {
            const [date, period] = slotId.split('_');
            if (!acc[date]) acc[date] = [];
            acc[date].push(period);
            return acc;
        }, {});

        // グループごとに確定情報を作成
        for (const date in groupedSlots) {
            const periods = groupedSlots[date];
            const participants = getParticipantsForSlots(song, periods.map(p => `${date}_${p}`));

            const newPractice = {
                date: date,
                periods: periods,
                room: room,
                equipment: equipment,
                participants: participants,
                warnings: [],
            };
            newConfirmedPractices.push(newPractice);
        }

        // バリデーションチェック
        const allSongsInCircle = Object.values(state.allData.songs)
            .filter(s => s.circleCode === song.circleCode);

        newConfirmedPractices.forEach(practice => {
            // 練習かぶりチェック
            const overlapUsers = checkUserOverlap(practice, allSongsInCircle, song.id);
            overlapUsers.forEach(overlap => {
                practice.warnings.push(`⚠️ ${overlap.user}さんは「${overlap.song}」と練習がかぶっています。`);
            });

            // 機材在庫チェック
            const equipmentShortages = checkEquipmentStock(practice, allSongsInCircle, song.id);
            equipmentShortages.forEach(shortage => {
                practice.warnings.push(`⚠️ 機材「${shortage.item}」の在庫が不足しています (他曲と重複)。`);
            });
        });

        // 確定情報を保存
        song.confirmed.push(...newConfirmedPractices);
        dataManager.setSong(song);

        // UIを更新
        document.getElementById('practice-confirmation-modal').style.display = 'none';
        showScheduleInputScreen(); // 画面全体を再描画
        alert('練習コマを確定しました。警告がある場合は内容を確認してください。');
    }


    // ===== ヘルパー関数 =====
    function getDatesInRange(startDate, endDate) {
        const dates = [];
        let currentDate = new Date(startDate);
        const lastDate = new Date(endDate);
        while (currentDate <= lastDate) {
            dates.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }

    function formatDate(date) {
        return `${date.getMonth() + 1}/${date.getDate()}(${['日','月','火','水','木','金','土'][date.getDay()]})`;
    }


    function isSlotConfirmed(song, cellId) {
        const [date, period] = cellId.split('_');
        return song.confirmed.some(p => p.date === date && p.periods.includes(period));
    }
    
    function getParticipantsForSlots(song, slotIds) {
        const participants = new Set();
        slotIds.forEach(slotId => {
            Object.entries(song.availability).forEach(([nickname, avail]) => {
                if (avail.includes(slotId)) {
                    participants.add(nickname);
                }
            });
        });
        return Array.from(participants);
    }
    
    // ===== バリデーション関数 =====

    function checkUserOverlap(newPractice, allSongs, currentSongId) {
        const overlaps = [];
        newPractice.participants.forEach(participant => {
            allSongs.forEach(song => {
                // 自分自身の曲の既存のコマとは比較しない (今回まとめて確定するため)
                // if (song.id === currentSongId) return;

                song.confirmed.forEach(existingPractice => {
                    // 同じ日付で、時間帯が一つでもかぶっているか
                    const isSameDay = existingPractice.date === newPractice.date;
                    const hasTimeOverlap = existingPractice.periods.some(p => newPractice.periods.includes(p));

                    if (isSameDay && hasTimeOverlap && existingPractice.participants.includes(participant)) {
                         // 自分自身の曲の場合は、今回確定するコマ以外との比較
                        if (song.id === currentSongId) {
                            const isComparingWithSelfNew = state.confirmingSlots.some(slotId => {
                                const [d, p] = slotId.split('_');
                                return existingPractice.date === d && existingPractice.periods.includes(p);
                            });
                            if (isComparingWithSelfNew) return;
                        }
                        overlaps.push({ user: participant, song: song.songTitle });
                    }
                });
            });
        });
        return overlaps;
    }
    
    function checkEquipmentStock(newPractice, allSongs, currentSongId) {
        const shortages = [];
        newPractice.equipment.forEach(item => {
            let usedCount = 1; // 今回確定する分
            
            allSongs.forEach(song => {
                song.confirmed.forEach(existingPractice => {
                    // 自分自身の今回確定するコマとは比較しない
                    if (song.id === currentSongId) {
                         const isComparingWithSelfNew = state.confirmingSlots.some(slotId => {
                            const [d, p] = slotId.split('_');
                            return existingPractice.date === d && existingPractice.periods.includes(p);
                        });
                        if (isComparingWithSelfNew) return;
                    }

                    const isSameDay = existingPractice.date === newPractice.date;
                    const hasTimeOverlap = existingPractice.periods.some(p => newPractice.periods.includes(p));

                    if (isSameDay && hasTimeOverlap && existingPractice.equipment.includes(item)) {
                        usedCount++;
                    }
                });
            });

            if (usedCount > EQUIPMENT_STOCK[item]) {
                shortages.push({ item: item, count: usedCount });
            }
        });
        return shortages;
    }


    // ===== アプリケーション開始 =====
    init();
});
