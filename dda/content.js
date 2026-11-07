/* Conținutul evenimentului „Dincolo de aparențe”. Aici se actualizează linkurile, programul și speakerii. */
window.DDA = {
  links: {
    /* null = neconfigurat: butonul rămâne dezactivat și apare o notă în căsuța de acces. */
    checkout: 'https://buy.stripe.com/9B6eVeckheoFafE78s24004',
    privacy: 'politica-confidentialitate.html'
  },

  program: {
    /* intro se afișează doar dacă schedule e gol */
    intro: ['Începem la 10:00.', 'Programul detaliat va fi anunțat în curând.'],
    schedule: [
      { time: '10:00–11:00', guest: 'Ana Maria', role: 'Coach & terapeut', title: 'Arhitectura deciziei.', text: 'Relația dintre emoții, convingeri și bani. O deschidere dedicată felului în care ne raportăm la risc și la propriile alegeri.' },
      { time: '11:00–12:00', guest: 'Mihai Tiepac', role: 'Senior Trader', title: 'Frica este bună. Învață să o asculți.', text: 'Despre frica de pierdere, presiunea de a acționa și disciplina de a lua decizii când emoțiile sunt puternice.' },
      { time: '12:00–12:30', guest: 'Broker Presentation', role: '', title: 'Infrastructura încrederii.', text: 'O perspectivă asupra brokerului, platformei și condițiilor care susțin experiența de tranzacționare.' },
      { time: '12:30–13:00', guest: 'Coffee break & networking', role: '', title: '', text: 'Cafea, întâlniri și conversații cu invitații și membrii comunității.', pause: true },
      { time: '13:00–14:00', guest: 'Panos Markopoulos', role: '6 figures investor', title: 'Copy trading, dincolo de procente.', text: 'Mecanisme, selecția strategiilor și înțelegerea riscului. Prezentare în limba engleză, cu traducere în limba română.' },
      { time: '14:00–15:00', guest: 'Andreea', role: 'Trader, Mentor, Fondator Profit District', title: 'De la curiozitate la o alegere informată.', text: 'O perspectivă practică asupra copy tradingului: ce verifici, ce întrebi și cum stabilești așteptări realiste. Sesiune cu exemple și întrebări din public.' },
      { time: '15:00–15:15', guest: 'Ana Maria', role: 'Coach & terapeut', title: 'Claritate pentru ce urmează.', text: 'Reflecțiile de final și integrarea ideilor esențiale ale conferinței.' }
    ],
    themes: []
  },

  /* photo: cale către imagine, ex. 'images/dincolo-de-aparente/panos.jpg'. Câmpurile goale nu se afișează. */
  speakers: [
    { name: 'Ana Maria', photo: 'images/dincolo-de-aparente/ana-maria.jpg', photoAlt: 'Ana Maria', role: 'Coach & terapeut', topic: '', bio: 'Relația dintre emoții, convingeri și bani.' },
    { name: 'Mihai Tiepac', photo: 'images/dincolo-de-aparente/mihai-tiepac.jpg', photoAlt: 'Mihai Tiepac', role: 'Senior Trader', topic: '', bio: 'După 14 ani în piețele financiare, Mihai vine să ne prezinte rolul fricii în deciziile pe care le luăm despre bani.' },
    { name: 'Panos Markopoulos', photo: 'images/dincolo-de-aparente/panos-markopoulos.jpg', photoAlt: 'Panos Markopoulos', role: '6 figures investor', topic: '', bio: 'Cu un portofoliu ajuns la +900.000$, Panos vine să ne vorbească despre alegerea și diversificarea inteligentă a investițiilor pentru a ajunge la rezultate optime.' },
    { name: 'Andreea Dolin (Hane)', photo: 'images/dincolo-de-aparente/andreea-dolin.jpg', photoAlt: 'Andreea Dolin', role: 'Trader, Mentor, Fondator Profit District', topic: '', bio: 'Fondatoarea Profit District, Andreea aduce perspectiva omului care construiește la intersecția dintre trading, educație și comunitate.' }
  ],

  broker: { title: 'Broker Presentation', image: null, imageAlt: '', text: 'Infrastructura încrederii. O perspectivă asupra brokerului, platformei și condițiilor care susțin experiența de tranzacționare.' }
};
