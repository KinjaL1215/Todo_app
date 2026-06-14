/* ==========================================================================
   Taskflow JavaScript Controller (REST API, AJAX, State, Themes, and Toasts)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // State Management
    let tasks = [];
    let currentFilter = 'all';

    // DOM Elements Cache
    const taskForm = document.getElementById('task-form');
    const taskTitleInput = document.getElementById('task-title');
    const taskEmailInput = document.getElementById('task-email');
    const taskDateInput = document.getElementById('task-date');
    const taskTimeInput = document.getElementById('task-time');
    const tasksListContainer = document.getElementById('tasks-list');
    const emptyState = document.getElementById('empty-state');

    const normalizeReminderInput = (value) => {
        if (!value) return '';
        const trimmed = value.trim();
        if (!trimmed) return '';

        const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
        if (isoPattern.test(trimmed)) {
            return trimmed.replace('T', ' ');
        }

        const dashPattern = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/;
        const slashPattern = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
        const dashMatch = trimmed.match(dashPattern);
        const slashMatch = trimmed.match(slashPattern);

        if (dashMatch) {
            return `${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]} ${dashMatch[4]}:${dashMatch[5]}`;
        }
        if (slashMatch) {
            return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]} ${slashMatch[4]}:${slashMatch[5]}`;
        }

        return trimmed;
    };

    const buildReminderDateTime = (dateValue, timeValue) => {
        if (!dateValue && !timeValue) return '';
        const datePart = dateValue || new Date().toISOString().split('T')[0];
        const timePart = timeValue || '00:00';

        // Create a local date object from user input
        const localDate = new Date(`${datePart}T${timePart}`);
        if (isNaN(localDate.getTime())) return '';

        // Convert to UTC ISO string for the server to match its clock
        return localDate.toISOString().slice(0, 16).replace('T', ' ');
    };

    const formatReminderDisplay = (value) => {
        if (!value) return '';
        const normalized = value.trim().replace(' ', 'T');
        const reminderDate = new Date(normalized);
        if (Number.isNaN(reminderDate.getTime())) return value;
        return reminderDate.toLocaleString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getReminderDiffLabel = (value) => {
        if (!value) return '';
        const normalized = value.trim().replace(' ', 'T');
        const reminderDate = new Date(normalized);
        if (Number.isNaN(reminderDate.getTime())) return '';

        const diffMs = reminderDate.getTime() - Date.now();
        const absMs = Math.abs(diffMs);
        const days = Math.floor(absMs / 86400000);
        const hours = Math.floor((absMs % 86400000) / 3600000);
        const minutes = Math.floor((absMs % 3600000) / 60000);

        const parts = [];
        if (days) parts.push(`${days}d`);
        if (hours) parts.push(`${hours}h`);
        if (!days && minutes) parts.push(`${minutes}m`);
        if (parts.length === 0) parts.push('0m');

        const label = parts.join(' ');
        return diffMs >= 0 ? `in ${label}` : `overdue by ${label}`;
    };
    
    // Stats Cache
    const statTotal = document.getElementById('stat-total');
    const statActive = document.getElementById('stat-active');
    const statCompleted = document.getElementById('stat-completed');
    const statReminders = document.getElementById('stat-reminders');

    // Filters Cache
    const filterButtons = document.querySelectorAll('.filter-btn');

    // Theme Toggle Cache
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunIcon = themeToggleBtn.querySelector('.sun-icon');
    const moonIcon = themeToggleBtn.querySelector('.moon-icon');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    /* ==========================================================================
       Theme Configuration
       ========================================================================== */
    const initTheme = () => {
        const savedTheme = localStorage.getItem('taskflow-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcons(savedTheme);
    };

    const updateThemeIcons = (theme) => {
        if (theme === 'light') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    };

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('taskflow-theme', newTheme);
        updateThemeIcons(newTheme);
        showToast(`Switched to ${newTheme} mode!`, 'info');
    });

    /* ==========================================================================
       Toast Notification Helper
       ========================================================================== */
    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        } else {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="9" x2="12.01" y2="9"></line></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Remove toast after duration
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px) scale(0.95)';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3500);
    };

    /* ==========================================================================
       Statistics Updater
       ========================================================================== */
    const updateStats = () => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed === 1).length;
        const active = total - completed;
        // Reminders are pending if email is set, reminder time is set, task is not completed, and reminder is not sent yet.
        const pendingReminders = tasks.filter(t => t.email && t.reminder_time && t.completed === 0 && t.reminder_sent === 0).length;

        statTotal.textContent = total;
        statActive.textContent = active;
        statCompleted.textContent = completed;
        statReminders.textContent = pendingReminders;
    };

    /* ==========================================================================
       Task Rendering Engine
       ========================================================================== */
    const renderTasks = () => {
        // Filter tasks
        let filteredTasks = tasks;
        if (currentFilter === 'active') {
            filteredTasks = tasks.filter(t => t.completed === 0);
        } else if (currentFilter === 'completed') {
            filteredTasks = tasks.filter(t => t.completed === 1);
        }

        // Empty State handling
        if (filteredTasks.length === 0) {
            tasksListContainer.style.display = 'none';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        tasksListContainer.style.display = 'flex';
        tasksListContainer.innerHTML = '';

        filteredTasks.forEach(task => {
            const taskItem = document.createElement('li');
            taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;
            taskItem.dataset.id = task.id;

            // Generate badges markup
            let badgesHtml = '';
            if (task.email) {
                badgesHtml += `<span class="badge badge-email">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    ${task.email}
                </span>`;
            }
            if (task.reminder_time) {
                const isSent = task.reminder_sent === 1;
                const displayTime = formatReminderDisplay(task.reminder_time);
                const diffLabel = getReminderDiffLabel(task.reminder_time);
                badgesHtml += `<span class="badge badge-reminder ${isSent ? 'sent' : ''}">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    ${displayTime} ${isSent ? '(Sent)' : ''}${diffLabel ? ` · ${diffLabel}` : ''}
                </span>`;
            }

            taskItem.innerHTML = `
                <!-- Checkbox -->
                <label class="checkbox-container" aria-label="Toggle Complete">
                    <input type="checkbox" class="checkbox-input" ${task.completed ? 'checked' : ''}>
                    <div class="checkmark">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                </label>

                <!-- Task Details -->
                <div class="task-content">
                    <span class="task-title-text">${escapeHtml(task.title)}</span>
                    ${badgesHtml ? `<div class="task-badges">${badgesHtml}</div>` : ''}
                </div>

                <!-- Actions Controls -->
                <div class="task-actions">
                    <button class="action-btn edit-btn" aria-label="Edit Task">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
                    </button>
                    <button class="action-btn delete-btn" aria-label="Delete Task">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            `;

            // Bind checkmark toggle
            const checkbox = taskItem.querySelector('.checkbox-input');
            checkbox.addEventListener('change', () => toggleTaskCompleted(task.id, checkbox.checked));

            // Bind delete button
            const deleteBtn = taskItem.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => deleteTask(task.id, taskItem));

            // Bind edit button
            const editBtn = taskItem.querySelector('.edit-btn');
            editBtn.addEventListener('click', () => enterEditMode(taskItem, task));

            tasksListContainer.appendChild(taskItem);
        });
    };

    const escapeHtml = (text) => {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    };

    /* ==========================================================================
       API Operations (AJAX Fetch)
       ========================================================================== */
    const loadTasks = async () => {
        try {
            const response = await fetch('/api/tasks');
            if (!response.ok) throw new Error('Failed to load tasks');
            tasks = await response.json();
            renderTasks();
            updateStats();
        } catch (error) {
            console.error(error);
            showToast('Could not fetch tasks from server.', 'error');
        }
    };

    // Add Task
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = taskTitleInput.value.trim();
        const email = taskEmailInput.value.trim();
        const reminder_time = normalizeReminderInput(buildReminderDateTime(taskDateInput.value, taskTimeInput.value));

        if (!title) return;

        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, email, reminder_time })
            });

            if (!response.ok) throw new Error('Failed to add task');
            const newTask = await response.json();
            
            // Add to state and render
            tasks.unshift(newTask);
            renderTasks();
            updateStats();
            
            // Reset form
            taskForm.reset();
            
            showToast('Task added successfully!');
        } catch (error) {
            console.error(error);
            showToast('Failed to save task to server.', 'error');
        }
    });

    // Toggle Task Status
    const toggleTaskCompleted = async (id, isCompleted) => {
        try {
            const response = await fetch(`/api/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: isCompleted })
            });

            if (!response.ok) throw new Error('Failed to update task status');
            
            // Update local state
            const task = tasks.find(t => t.id === id);
            if (task) {
                task.completed = isCompleted ? 1 : 0;
                // Find DOM element and toggle styling
                const item = tasksListContainer.querySelector(`.task-item[data-id="${id}"]`);
                if (item) {
                    if (isCompleted) {
                        item.classList.add('completed');
                    } else {
                        item.classList.remove('completed');
                    }
                }
                updateStats();
                showToast(isCompleted ? 'Task completed! 🎉' : 'Task marked active.');
                // Re-render if filter is active/completed
                if (currentFilter !== 'all') {
                    setTimeout(renderTasks, 300); // Allow toggle animation
                }
            }
        } catch (error) {
            console.error(error);
            showToast('Failed to sync status with server.', 'error');
            loadTasks(); // Revert UI
        }
    };

    // Delete Task
    const deleteTask = async (id, element) => {
        try {
            const response = await fetch(`/api/tasks/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete task');
            
            // Animate removal
            element.style.opacity = '0';
            element.style.transform = 'translateX(20px)';
            setTimeout(() => {
                tasks = tasks.filter(t => t.id !== id);
                renderTasks();
                updateStats();
                showToast('Task deleted successfully.');
            }, 300);
        } catch (error) {
            console.error(error);
            showToast('Failed to delete task on server.', 'error');
        }
    };

    // Enter Inline Edit Mode
    const enterEditMode = (taskItem, task) => {
        const contentDiv = taskItem.querySelector('.task-content');
        const actionsDiv = taskItem.querySelector('.task-actions');
        const checkbox = taskItem.querySelector('.checkbox-container');

        // Hide checkbox and actions
        checkbox.style.display = 'none';
        actionsDiv.style.display = 'none';

        // Keep backup of original HTML
        const originalContent = contentDiv.innerHTML;

        contentDiv.innerHTML = `
            <form class="edit-form">
                <input type="text" class="edit-input-field" value="${escapeHtml(task.title)}" required>
                <div class="edit-actions">
                    <button type="submit" class="action-btn save-btn" aria-label="Save changes" style="color: var(--success);">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                    <button type="button" class="action-btn cancel-btn" aria-label="Cancel edit" style="color: var(--danger);">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </form>
        `;

        const editForm = contentDiv.querySelector('.edit-form');
        const editInput = contentDiv.querySelector('.edit-input-field');
        editInput.focus();

        // Handle save
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newTitle = editInput.value.trim();
            if (!newTitle) return;

            try {
                const response = await fetch(`/api/tasks/${task.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle })
                });

                if (!response.ok) throw new Error('Failed to update task');
                
                // Update local state
                task.title = newTitle;
                showToast('Task updated successfully.');
                exitEditMode();
            } catch (error) {
                console.error(error);
                showToast('Failed to update task on server.', 'error');
                exitEditMode();
            }
        });

        // Handle cancel
        contentDiv.querySelector('.cancel-btn').addEventListener('click', () => {
            exitEditMode();
        });

        const exitEditMode = () => {
            checkbox.style.display = 'flex';
            actionsDiv.style.display = 'flex';
            renderTasks();
        };
    };

    /* ==========================================================================
       Filtering Event Listeners
       ========================================================================== */
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    /* ==========================================================================
       Initial Bootstrapping
       ========================================================================== */
    initTheme();
    loadTasks();
});
