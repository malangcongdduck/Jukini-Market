const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('Sequelize');


const { Good, Auction, User, sequelize } = require('../models');
const { isLoggedIn, isNotLoggedIn } = require('./middlewares');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1)
    const goods = await Good.findAll({ where: { createdAt : { [Op.gte ] : yesterday}, } }); 
    res.render('main', {
      title: 'Fresh-Market',
      goods,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/join', isNotLoggedIn, (req, res) => {
  res.render('join', {
    title: '회원가입',
  });
});

router.get('/good', isLoggedIn, (req, res) => {
  res.render('good', { title: '상품 등록' });
});

try {
  fs.readdirSync('uploads');
} catch (error) {
  console.error('uploads 폴더가 없어 uploads 폴더를 생성합니다.');
  fs.mkdirSync('uploads');
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, 'uploads/');
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, path.basename(file.originalname, ext) + new Date().valueOf() + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/good', isLoggedIn, upload.single('img'), async (req, res, next) => {
  try {
    const { name, price, amount } = req.body;
    const good = await Good.create({
      OwnerId: req.user.id,
      name,
      img: req.file.filename,
      price,
      amount,
    });

    res.redirect('/');
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//해당 상품의 기존 정보들을 불러온 뒤 랜더링
router.get('/good/:id', isLoggedIn, async (req, res, next) => {
  try {
    const [good, auction] = await Promise.all([
      Good.findOne({
        where: { id: req.params.id },
        include: {
          model: User,
          as: 'Owner',
        },
      }),
      Auction.findAll({
        where: { goodId: req.params.id },
        include: { model: User },
        order: [['bid', 'ASC']],
      }),
    ]);
    res.render('auction', {
      title: `${good.name}`,
      good,
      auction,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//클라이언트로부터 받은 입찰 정보를 저장
router.post('/good/:id/bid', isLoggedIn, async (req, res, next) => {
  try {
    const { bid, msg } = req.body;
    const good = await Good.findOne({
      where: { id: req.params.id },
      include: { model: Auction },
      order: [[{ model: Auction }, 'bid']],
    });
    if (good.amount < bid) {
      return res.status(403).send('구매할 수 있는 수량을 초과하였습니다.');
    }
    if (new Date(good.createdAt).valueOf() + (24 * 60 * 60 * 1000) < new Date()) {
      return res.status(403).send('판매가 이미 종료되었습니다');
    }
    if (good.amount <=0 ) {
      return res.status(403).send('재고가 없습니다.');
    }
    if (bid <= 0 ){
      return res.status(403).send('잘못된 수량을 입력하였습니다.');
    }

    if (good.OwnerId == req.user.id) {
      return res.status(403).send('판매자는 구매할 수 없습니다.');
    }
    
    const result = await Auction.create({
      bid,
      msg,
      UserId: req.user.id,
      GoodId: req.params.id,
    });

    await Good.update({  
      amount: good.amount - result.bid,
    }, { 
      where: { id: good.id } 
    });

    await User.update({
      money: sequelize.literal(`money - ${(result.bid * good.price)}`),
    }, {
      where: { id: result.UserId },
    });

    // 실시간으로 입찰 내역 전송
    req.app.get('io').to(req.params.id).emit('bid', {
      bid: result.bid,
      msg: result.msg,
      nick: req.user.nick,
    });
    return res.send('ok');
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

router.get('/list', isLoggedIn, async (req, res, next) => {
  try {
    const purchases = await Auction.findAll({
      where: { UserId: req.user.id },
      include: { model: Good },
    });
    res.render('list', { title: '구매 목록', purchases });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/lookup', isLoggedIn, async (req, res, next) => {
  try {
    const goods = await Good.findAll({
      where: { OwnerId: req.user.id },
      include: { model: Auction },
    });
    res.render('lookup', { title: '판매 목록', goods });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;
