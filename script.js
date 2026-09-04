tailwind.config = {
      theme: {
        extend: {
          colors: {
            crescent: { green: "#123D2B", gold: "#CFAE5C", cream: "#FFFAEE" }
          },
          boxShadow: {
            panel: "0 16px 44px rgba(18,61,43,.14)",
            soft: "0 10px 28px rgba(18,61,43,.12)"
          }
        }
      }
    };

(function() {
      var employees = [];
      var selectedEmployee = null;
      var pinBuffer = '';
      var attemptsByEmployee = {};
      var lockoutsByEmployee = {};
      var navigating = false;

      var rosterGrid = document.getElementById('roster-grid');
      var loadingState = document.getElementById('loading-state');
      var emptyState = document.getElementById('empty-state');
      var errorState = document.getElementById('error-state');
      var retryButton = document.getElementById('retry-button');
      var rosterSubtitle = document.getElementById('roster-subtitle');

      var pinModal = document.getElementById('pin-modal');
      var pinTitle = document.getElementById('pin-modal-title');
      var statusMessage = document.getElementById('status-message');
      var pinDots = Array.prototype.slice.call(document.querySelectorAll('.pin-dot'));
      var pinInput = document.getElementById('pin-input');
      var cancelPin = document.getElementById('cancel-pin');
      var pinShake = document.getElementById('pin-shake');
      var lockoutTimer = null;
      var lockoutTickTimer = null;

      function endpointUrl() {
        var meta = document.querySelector('meta[name="sheet-data-url"]');
        return meta && meta.content ? meta.content : '';
      }

      function resetPinUI() {
        pinBuffer = '';
        pinInput.value = '';
        updateDots();
        clearStatus();
      }

      function clearStatus() {
        statusMessage.textContent = selectedEmployee ? 'Enter your 4-digit staff PIN.' : 'Tap your name to continue.';
      }

      function updateDots() {
        for (var i = 0; i < pinDots.length; i++) pinDots[i].classList.toggle('filled', i < pinBuffer.length);
      }

      function openModal(employee) {
        selectedEmployee = employee;
        pinTitle.textContent = employee.name;
        resetPinUI();
        pinModal.classList.remove('hidden');
        pinModal.classList.add('flex');
        setTimeout(function() { pinInput.focus(); }, 50);
        document.addEventListener('keydown', handleKeydown);
      }

      function closeModal() {
        pinModal.classList.add('hidden');
        pinModal.classList.remove('flex');
        document.removeEventListener('keydown', handleKeydown);
        selectedEmployee = null;
        stopLockoutTimers();
        resetPinUI();
      }

      function stopLockoutTimers() {
        if (lockoutTimer) { clearTimeout(lockoutTimer); lockoutTimer = null; }
        if (lockoutTickTimer) { clearInterval(lockoutTickTimer); lockoutTickTimer = null; }
      }

      function renderRoster() {
        rosterGrid.innerHTML = '';
        if (!employees.length) {
          loadingState.classList.add('hidden');
          errorState.classList.add('hidden');
          emptyState.classList.remove('hidden');
          rosterGrid.classList.add('hidden');
          retryButton.classList.add('hidden');
          rosterSubtitle.textContent = 'No active staff available.';
          return;
        }
        employees.forEach(function(emp) {
          var lockedUntil = lockoutsByEmployee[emp.key] || 0;
          var locked = lockedUntil > Date.now();
          var remaining = locked ? Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)) : 0;

          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'employee-card touch-target flex w-full flex-col items-start justify-between rounded-3xl border-2 border-crescent-green/10 bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-crescent-gold/70 hover:bg-[#fffdf6] disabled:cursor-not-allowed disabled:opacity-60';
          button.disabled = locked;
          button.setAttribute('aria-label', emp.name + (locked ? ', temporarily locked' : ', PIN required'));
          button.innerHTML = '<div class="flex w-full items-start justify-between gap-4"><div class="min-w-0"><div class="text-2xl font-black leading-tight text-crescent-green">' + escapeHtml(emp.name) + '</div><div class="mt-2 text-sm font-semibold text-slate-600">' + (locked ? 'Try again in ' + remaining + 's' : 'PIN required') + '</div></div><div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ' + (locked ? 'bg-slate-100 text-slate-500' : 'bg-crescent-cream text-crescent-green') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="h-6 w-6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/></svg></div></div>';
          if (!locked) {
            button.addEventListener('click', function() { openModal(emp); });
          } else {
            button.addEventListener('click', function() { renderRoster(); });
          }
          rosterGrid.appendChild(button);
        });
        loadingState.classList.add('hidden');
        errorState.classList.add('hidden');
        emptyState.classList.add('hidden');
        rosterGrid.classList.remove('hidden');
        retryButton.classList.add('hidden');
        rosterSubtitle.textContent = employees.length + ' active staff member' + (employees.length === 1 ? '' : 's') + ' ready.';
      }

      function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      function loadRoster() {
        loadingState.classList.remove('hidden');
        emptyState.classList.add('hidden');
        errorState.classList.add('hidden');
        rosterGrid.classList.add('hidden');
        retryButton.classList.add('hidden');
        rosterSubtitle.textContent = 'Loading active staff…';

        var endpoint = endpointUrl();
        if (!endpoint) {
          loadingState.classList.add('hidden');
          errorState.classList.remove('hidden');
          retryButton.classList.remove('hidden');
          rosterSubtitle.textContent = 'Roster unavailable.';
          return;
        }

        fetch(endpoint)
          .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function(result) {
            var rows = result && Array.isArray(result.data) ? result.data : [];
            employees = rows.filter(function(row) {
              var active = String(row.Active == null ? '' : row.Active).trim().toLowerCase();
              return (active === 'true' || active === 'yes' || active === 'active' || active === '1') &&
                String(row['Employee Name'] || '').trim() &&
                String(row.PIN || '').trim() &&
                String(row['Scanner Link'] || '').trim();
            }).map(function(row, index) {
              return {
                name: String(row['Employee Name']).trim(),
                normalized: String(row['Normalized Name'] || '').trim(),
                pin: String(row.PIN).trim(),
                scannerLink: String(row['Scanner Link']).trim(),
                displayOrder: row['Display Order'] === '' || row['Display Order'] == null ? null : Number(row['Display Order']),
                key: String(row['Normalized Name'] || row['Employee Name'] || index).trim().toLowerCase()
              };
            }).sort(function(a, b) {
              var ao = a.displayOrder;
              var bo = b.displayOrder;
              var aBlank = ao == null || isNaN(ao);
              var bBlank = bo == null || isNaN(bo);
              if (aBlank && bBlank) return a.name.localeCompare(b.name);
              if (aBlank) return 1;
              if (bBlank) return -1;
              if (ao !== bo) return ao - bo;
              return a.name.localeCompare(b.name);
            });

            loadFinished();
          })
          .catch(function(err) {
            console.error('Sheet data error:', err);
            employees = [];
            loadingState.classList.add('hidden');
            errorState.classList.remove('hidden');
            retryButton.classList.remove('hidden');
            rosterSubtitle.textContent = 'Roster unavailable.';
          });
      }

      function loadFinished() {
        if (!employees.length) {
          renderRoster();
          return;
        }
        attemptsByEmployee = {};
        lockoutsByEmployee = {};
        renderRoster();
      }

      function getCurrentEmployee() {
        return selectedEmployee && employees.filter(function(e) { return e.key === selectedEmployee.key; })[0] || selectedEmployee;
      }

      function setMessage(msg) {
        statusMessage.textContent = msg;
      }

      function addDigit(d) {
        if (!selectedEmployee) return;
        if (pinBuffer.length >= 4) return;
        pinBuffer += d;
        pinInput.value = pinBuffer;
        updateDots();
        if (pinBuffer.length === 4) validateAndNavigate();
      }

      function backspaceDigit() {
        if (!selectedEmployee) return;
        pinBuffer = pinBuffer.slice(0, -1);
        pinInput.value = pinBuffer;
        updateDots();
      }

      function clearPin() {
        pinBuffer = '';
        pinInput.value = '';
        updateDots();
      }

      function lockEmployee(emp) {
        lockoutsByEmployee[emp.key] = Date.now() + 30000;
        renderRoster();
        closeModal();
        var remaining = 30;
        retryButton.classList.add('hidden');
        var interval = setInterval(function() {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(interval);
            delete lockoutsByEmployee[emp.key];
            renderRoster();
          }
        }, 1000);
      }

      function validateAndNavigate() {
        if (!selectedEmployee || navigating) return;
        var emp = getCurrentEmployee();
        if (!emp) return;
        var typed = String(pinBuffer).trim();
        if (typed.length !== 4) {
          setMessage('Enter your 4-digit staff PIN.');
          pinShake.classList.remove('shake');
          void pinShake.offsetWidth;
          pinShake.classList.add('shake');
          return;
        }

        if (typed !== String(emp.pin).trim()) {
          attemptsByEmployee[emp.key] = (attemptsByEmployee[emp.key] || 0) + 1;
          setMessage('Incorrect PIN. Try again.');
          pinShake.classList.remove('shake');
          void pinShake.offsetWidth;
          pinShake.classList.add('shake');
          clearPin();
          if (attemptsByEmployee[emp.key] >= 5) {
            setMessage('Too many attempts. Please wait 30 seconds.');
            lockEmployee(emp);
          }
          return;
        }

        try {
          var parsed = new URL(emp.scannerLink, window.location.href);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid scanner URL');
          navigating = true;
          setMessage('Opening ' + emp.name + '’s scanner…');
          document.removeEventListener('keydown', handleKeydown);
          window.location.assign(parsed.href);
        } catch (e) {
          setMessage('That scanner link is unavailable. Please contact a manager.');
          clearPin();
        }
      }

      function handleKeydown(e) {
        if (pinModal.classList.contains('hidden')) return;
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          addDigit(e.key);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          backspaceDigit();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          validateAndNavigate();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeModal();
        }
      }

      document.querySelectorAll('.pin-key').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var key = btn.getAttribute('data-key');
          if (key === 'backspace') backspaceDigit();
          else if (key === 'clear') clearPin();
          else addDigit(key);
          pinInput.focus();
        });
      });

      pinInput.addEventListener('input', function() {
        var filtered = pinInput.value.replace(/\D/g, '').slice(0, 4);
        pinBuffer = filtered;
        pinInput.value = pinBuffer;
        updateDots();
        if (pinBuffer.length === 4) validateAndNavigate();
      });

      cancelPin.addEventListener('click', function() { closeModal(); });
      pinModal.addEventListener('click', function(e) {
        if (e.target === pinModal) closeModal();
      });
      retryButton.addEventListener('click', loadRoster);

      window.addEventListener('pageshow', function() {
        navigating = false;
        attemptsByEmployee = {};
        stopLockoutTimers();
        closeModal();
        clearPin();
        loadRoster();
      });

      window.addEventListener('focus', function() {
        if (!pinModal.classList.contains('hidden')) pinInput.focus();
      });

      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
          if (pinModal.classList.contains('hidden')) {
            loadRoster();
          } else {
            setTimeout(function() { pinInput.focus(); }, 50);
          }
        }
      });

      loadRoster();
    })();