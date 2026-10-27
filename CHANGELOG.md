# Changelog — Pokemon 3D Base (26–27/10)

## Jogo
- Pokémon selvagens voltaram a aparecer no servidor local, com batalha e captura funcionando.
- O nome do jogo mudou para "Pokemon 3D Base".
- Foram recriados os módulos que faltavam: regras do passe e arrastar time/caixa.
- As texturas dos modelos carregam sem gerar centenas de erros no console.
- Tela de criação de personagem com páginas (setas, contador "1 / 3" e arrastar). Agora são 14 visuais masculinos e 15 femininos.
- 21 roupas novas com cores editáveis (pele, cabelo, roupa, olhos).
- Raid ao vivo: o GM anuncia, os jogadores entram na fila, vão para a arena, lutam contra o chefe, ganham o prêmio e voltam.
- Eventos ao vivo com multiplicadores, aviso global e modo manutenção (pode ser agendado, com avisos 10, 5 e 1 min antes).
- Comandos de GM no chat (/online, /tp, /puxar e moderação), que usam as mesmas funções do painel.
- Diálogos, traduções e músicas por área agora vêm de arquivos editáveis.

## Servidor e segurança
- Senhas guardadas com scrypt e sal por usuário. Quem tem senha antiga continua entrando.
- A sessão de login expira em 30 dias.
- Limite de tentativas por IP para criar conta, entrar e recuperar senha.
- O servidor gera e confere a captura e o Pokémon inicial (IVs, natureza, shiny e espécie válida).
- Bloqueadas as trapaças feitas pelo próprio jogo do jogador: dinheiro falso, Pokémon falso, sobrescrever o save, receber de novo a recompensa de missão, forjar a Pokédex.
- Novos limites no chat (240 caracteres), no título (40) e na cura (uma a cada 2 s). Mensagens em tempo real também ganharam limite de tamanho e de frequência.
- Banir e silenciar jogadores, por tempo ou para sempre.
- Backup automático de todo arquivo salvo pelo painel.
- Corrigido: acentos estragavam ao salvar arquivos grandes.
- Cada conta joga em uma aba por vez: a aba antiga mostra "Você entrou de outro lugar" e o personagem dela some do mapa (antes cada aba virava mais um boneco).
- Corrigido: capturar Pokémon com conta logada dava "sem conexão com o servidor".
- Corrigido: os IVs dos Pokémon criados pelo servidor (inicial e capturas) eram lidos como zero pelo jogo. Os Pokémon já salvos foram convertidos.
- Corrigido: missões travavam com conta logada. Os passos de ir a um lugar, derrotar selvagem ou treinador, curar, subir de nível e ganhar insígnia não chegavam ao servidor; só "falar" avançava.
- Missões pulam passos que já estão cumpridos (ex.: inicial já escolhido, nível já alcançado). Quem travou em "Vá ao laboratório" destrava ao entrar no lab.

## Modo dev (F8, só GM)
- Botão "⚙ Painel Admin" abaixo de Chamar chefe/Montar/Seguir: abre o /admin numa aba nova.
- A janela de diagnóstico pode ser arrastada. A posição fica salva no navegador; duplo clique devolve pro lugar.

## Painel Admin (/admin)
- **Editor de Mapa:**
  - Zonas de spawn.
  - Áreas: criar, renomear, mover e redimensionar, com o minimapa por baixo.
  - Camadas: NPCs, portas, vagas de treinador, grama, água e spawn de caverna.
- **Habitats por área**, com o nível de cada área.
- **Editor de Cenário 3D:** mover, duplicar, excluir e colocar peças nos 73 mapas, incluindo chão e água.
- **Jogadores:** buscar, editar mochila, time e Pokémon, mudar cargo, banir, silenciar ou expulsar, com registro das ações.
- **Arquivos de dados:**
  - Configurações do jogo (taxa de shiny, nível máximo, Pokébolas e suas taxas).
  - Itens, lojas, treinadores, NPCs e falas, portas, ginásios e insígnias.
  - Mochilas, curvas de EXP, Pokémon iniciais, montarias e golpes.
  - Skins de treinador: quais aparecem na criação e quais têm cores editáveis.
  - Cores de NPC, diálogos, traduções, músicas e configuração da raid.
- **Telas próprias** para Missões, Espécies, Evoluções e golpes por nível.
- **Prévias** de skin em 3D, item, treinador/NPC e mochila.
- **Histórico / Desfazer** para qualquer arquivo salvo.
- As alterações chegam ao jogo aberto na hora. Algumas pedem F5.
