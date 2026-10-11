// ═══════════════════════════════════════════════════════════════
// DRAFT HELPER — Frontend Modulu
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var draftState = {
    brawlers: [],
    maps: [],
    enemy: [],
    selectedMap: '',
    selectedMode: 'Gem Grab',
    suggestions: null,
    loading: false,
  };

  // Ana render funksiyası
  window.renderDraft = async function(el) {
    if (draftState.brawlers.length === 0) {
      try {
        var r1 = await api('/api/draft/brawlers');
        draftState.brawlers = r1.brawlers || [];
        var r2 = await api('/api/draft/maps');
        draftState.maps = r2.maps || [];
      } catch (e) {
        el.innerHTML = '<div class="panel p-6 text-red-400">Melumatlar yuklenmedi: ' + e.message + '</div>';
        return;
      }
    }

    renderDraftUI(el);
  };

  function renderDraftUI(el) {
    el.innerHTML = ''
      + '<h1 class="tour-page-title" style="margin-bottom:24px">DRAFT<span class="dot">.</span></h1>'
      + '<div class="panel" style="padding:24px;margin-bottom:20px">'
      +   '<h2 class="section-title">Dusmen Komandasi</h2>'
      +   '<p style="color:var(--text-muted);font-size:12px;margin-bottom:14px">'
      +     'Dusmen komandasinin secdiyi 1-3 brawler-i secin'
      +   '</p>'
      +   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" id="draft-enemy-list">'
      +     renderEnemyChips()
      +   '</div>'
      +   '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:16px">'
      +     '<div>'
      +       '<label class="kv-label">Xerite</label>'
      +       '<select id="draft-map" class="input-dark">'
      +         '<option value="">-- Xerite sec --</option>'
      +         draftState.maps.map(function(m) {
      +           return '<option value="' + m.slug + '" ' + (draftState.selectedMap === m.slug ? 'selected' : '') + '>' + m.name + ' (' + m.mode + ')</option>';
      +         }).join('')
      +       '</select>'
      +     '</div>'
      +     '<div>'
      +       '<label class="kv-label">Rejim</label>'
      +       '<select id="draft-mode" class="input-dark">'
      +         '<option>Gem Grab</option><option>Brawl Ball</option><option>Heist</option><option>Bounty</option><option>Knockout</option>'
      +       '</select>'
      +     '</div>'
      +   '</div>'
      +   '<button class="btn-gold" id="draft-run" style="width:100%;padding:14px"'
      +     (draftState.enemy.length === 0 ? ' disabled' : '')
      +   '>Analiz Et</button>'
      + '</div>'
      + '<div id="draft-results">'
      +   (draftState.suggestions ? renderResults() : '')
      + '</div>';

    // Brawler grid
    var brawlerGrid = document.createElement('div');
    brawlerGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:14px;max-height:320px;overflow-y:auto;padding:8px;background:var(--bg-deep);border:1px solid var(--border-steel)';
    brawlerGrid.innerHTML = draftState.brawlers.map(function(b) {
      var selected = draftState.enemy.indexOf(b.slug) !== -1;
      return '<button class="draft-brawler-btn" data-slug="' + b.slug + '" style="'
        + 'padding:8px;text-align:center;font-size:11px;cursor:pointer;transition:all .2s;'
        + 'border:1px solid ' + (selected ? 'var(--accent-gold)' : 'var(--border-steel)') + ';'
        + 'background:' + (selected ? 'var(--accent-gold-soft)' : 'var(--bg-panel-2)') + ';'
        + 'color:' + (selected ? 'var(--accent-gold)' : 'var(--text-muted)') + ';'
        + 'clip-path:var(--cut-corner-sm)">'
        + '<div style="font-weight:800">' + b.name + '</div>'
        + '<div style="font-size:9px;opacity:.6;margin-top:2px">' + (b.role || '') + '</div>'
        + '</button>';
    }).join('');

    el.querySelector('.panel').appendChild(brawlerGrid);

    // Event listeners
    el.querySelectorAll('.draft-brawler-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slug = btn.dataset.slug;
        var idx = draftState.enemy.indexOf(slug);
        if (idx === -1) {
          if (draftState.enemy.length >= 3) {
            toast('Maksimum 3 brawler sece bilersiniz', 'error');
            return;
          }
          draftState.enemy.push(slug);
        } else {
          draftState.enemy.splice(idx, 1);
        }
        renderDraftUI(el);
      });
    });

    el.querySelectorAll('.draft-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slug = btn.dataset.slug;
        draftState.enemy = draftState.enemy.filter(function(s) { return s !== slug; });
        renderDraftUI(el);
      });
    });

    document.getElementById('draft-map').addEventListener('change', function(e) {
      draftState.selectedMap = e.target.value;
    });
    document.getElementById('draft-mode').addEventListener('change', function(e) {
      draftState.selectedMode = e.target.value;
    });

    var runBtn = document.getElementById('draft-run');
    if (runBtn) {
      runBtn.addEventListener('click', async function() {
        draftState.loading = true;
        runBtn.textContent = 'Analiz edilir...';
        runBtn.disabled = true;
        try {
          var res = await api('/api/draft/suggest', {
            method: 'POST',
            body: {
              enemyBrawlers: draftState.enemy,
              mapSlug: draftState.selectedMap || undefined,
              mode: draftState.selectedMode,
            },
          });
          draftState.suggestions = res.suggestions;
          renderDraftUI(el);
        } catch (e) {
          toast(e.message, 'error');
          runBtn.textContent = 'Analiz Et';
          runBtn.disabled = false;
        }
      });
    }
  }

  function renderEnemyChips() {
    if (draftState.enemy.length === 0) {
      return '<span style="color:var(--text-muted);font-size:12px">Hele brawler secilmeyib</span>';
    }
    return draftState.enemy.map(function(slug) {
      var b = draftState.brawlers.find(function(x) { return x.slug === slug; });
      return '<span class="draft-chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(139,0,0,0.2);border:1px solid rgba(255,68,68,0.4);color:#FF8888;font-size:12px;font-weight:700;clip-path:var(--cut-corner-sm)">'
        + (b ? b.name : slug)
        + '<button class="draft-remove" data-slug="' + slug + '" style="color:#FF8888;font-size:14px">x</button>'
        + '</span>';
    }).join('');
  }

  function renderResults() {
    if (!draftState.suggestions || draftState.suggestions.length === 0) {
      return '<div class="panel p-6 text-center text-white/40">Netice yoxdur</div>';
    }
    return ''
      + '<h2 class="section-title">Tovsiye Olunan Pickler</h2>'
      + '<div style="display:grid;gap:12px">'
      +   draftState.suggestions.map(function(s, i) {
      +     var tier = s.score > 150 ? 'S' : s.score > 80 ? 'A' : s.score > 40 ? 'B' : 'C';
      +     var tierColor = { S: '#FFD700', A: '#4CAF50', B: '#60A5FA', C: '#9CA3AF' }[tier];
      +     return '<div class="panel" style="padding:18px;border-left:3px solid ' + tierColor + '">'
      +       '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      +         '<div>'
      +           '<span style="display:inline-block;padding:2px 8px;background:' + tierColor + ';color:#000;font-weight:900;font-size:10px;clip-path:var(--cut-corner-sm);margin-right:10px">' + tier + '-TIER</span>'
      +           '<span style="font-size:20px;font-weight:900;color:var(--accent-gold)">' + s.name + '</span>'
      +         '</div>'
      +         '<div style="text-align:right">'
      +           '<div style="font-size:22px;font-weight:900;color:var(--accent-platinum)">' + s.score + '</div>'
      +           '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Xal</div>'
      +         '</div>'
      +       '</div>'
      +       '<div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--text-muted)">'
      +         (s.meta ? '<span style="padding:3px 8px;background:var(--bg-panel-2);border:1px solid var(--border-soft)">Meta: ' + s.meta.winrate + '%</span>' : '')
      +         (s.meta ? '<span style="padding:3px 8px;background:var(--bg-panel-2);border:1px solid var(--border-soft)">Trend: ' + s.meta.trend + '</span>' : '')
      +         '<span style="padding:3px 8px;background:var(--bg-panel-2);border:1px solid var(--border-soft)">Rol: ' + (s.role || '?') + '</span>'
      +         '<span style="padding:3px 8px;background:var(--bg-panel-2);border:1px solid var(--border-soft)">' + s.counters.length + ' counter</span>'
      +       '</div>'
      +     '</div>';
      +   }).join('')
      + '</div>';
  }

  // Nav item əlavə et
  setTimeout(function() {
    var nav = document.querySelector('.main-nav');
    if (nav && !nav.querySelector('[href="#/draft"]')) {
      var draftLink = document.createElement('a');
      draftLink.href = '#/draft';
      draftLink.className = 'nav-link';
      draftLink.innerHTML = '<span>⚔</span> Draft';
      nav.appendChild(draftLink);

      // Aktiv sinxronizasiya
      var path = (location.hash || '#/').replace('#', '');
      if (path === '/draft') draftLink.classList.add('active');
    }
  }, 500);
})();
