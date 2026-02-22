// js/presentatievolgorde.js
// Rendert een eenvoudige genummerde lijst (1..n) met de geshuffelde leerlingen.

export function presentatievolgordeIndeling(leerlingen = []) {
  const grid = document.getElementById('plattegrond');
  if (!grid) return;

  grid.innerHTML = '';

  const ol = document.createElement('ol');
  ol.className = 'presentatie-lijst';

  leerlingen.forEach((naam, idx) => {
    const li = document.createElement('li');
    li.className = 'presentatie-item';
    li.dataset.groupId = `volg${idx + 1}`;

    const topic = document.createElement('div');
    topic.className = 'presentatie-topic topic-chip is-empty';
    topic.dataset.topicKey = li.dataset.groupId;
    topic.dataset.topic = '';
    topic.tabIndex = 0;
    topic.textContent = '+ onderwerp';

    const date = document.createElement('div');
    date.className = 'presentatie-date date-chip is-empty';
    date.dataset.dateKey = li.dataset.groupId;
    date.dataset.date = '';
    date.tabIndex = 0;
    date.textContent = '+ datum';

    const meta = document.createElement('div');
    meta.className = 'presentatie-meta';
    meta.appendChild(topic);
    meta.appendChild(date);

    const nr = document.createElement('span');
    nr.className = 'nr';
    nr.textContent = idx + 1;

    const nm = document.createElement('span');
    nm.className = 'naam';
    nm.textContent = naam;

    li.appendChild(meta);
    li.appendChild(nr);
    li.appendChild(nm);
    ol.appendChild(li);
  });

  grid.appendChild(ol);
}
