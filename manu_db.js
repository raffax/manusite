const express = require('express');
//const bodyParser = require('body-parser');
var formidable = require('formidable');
var fs = require('fs');
// Configure cloudant database call
var Cloudant = require('cloudant');
var cloudant = Cloudant("https://1f9c36ef-0414-4735-a03a-f21820cc2f87-bluemix:cb5cc4feb6b56a0a71fcd7c586233b164bb95827a2b3d25ca817d4cea05ba759@1f9c36ef-0414-4735-a03a-f21820cc2f87-bluemix.cloudant.com");
var egp = cloudant.db.use('egp'); 

const app = express();
app.use(express.static('public'));
//app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs')

// global variables
var uid="";
var curSite="Rome";
var curSession="";

// Define endpoint for homepage (just acknowledge)
app.get('/', function (req, res) {
  res.send({status:1,descri:'NoSql service is ready'});
})

// Define endpoint for testing API calls
app.get('/prova', function (req, res) {
    res.render('prova');
  })
//------------------------------------------------
// Endpoint for login verification
// -----------------------------------------------
app.post('/logga', function (req, res) {
  uid=req.body.uid;
  console.log("Logga come "+JSON.stringify(req.body));
  var query= {    
     "selector": {"type": "user","code": req.body.uid,"pw":req.body.pwd}
  }
  egp.find(query,function(err,data) {
//     console.log("controllo database "+JSON.stringify(data));
     if(data!=null && data.docs.length>0) {
       console.log("Logga termina OK");
       res.send({"status":1,"uid":uid});
     }
     else {
       console.log("Logga termina KO: "+JSON.stringify(err));
       res.send({"status":0});
     }
  })
});
// -----------------------------------------------------
// initialize new session and all related controls from 
// checklist template.
// -----------------------------------------------------
app.get('/init', function(req,res) {
    uid=req.query.uid;
    if(req.query.uid==null) {
        res.send({"status":0,"message":"Unvalid userid"});
    }
    else {
        createSessionFromCheckList('WTG_INSPECTION','Wtg inspection powered by Watson')
        .then(function(passi) {
           res.send({"status":1,"session": curSession,"checklist":passi}); 
        })
        .catch(function (err) {
            res.send({"status":0,"message": err}); 
        });    
    }
})
// ---------------------------------------------
// return all controls related to a session id
// ---------------------------------------------
app.post('/get_steps', function(req,res) {
    uid=req.body.uid;
    if(isNull(req.body.uid)) {
        res.send({"status":0,"message":"Unvalid userid"});
    }
    else {
        console.log("Looking for session ",req.query.ide);
        var passi=getStep(req.query.ide);
        res.send({"status":1,"checklist":passi});
    }
})
// -----------------------------------------
// Add a rating to a session control.
// -----------------------------------------
app.post('/step_rate',function(req,res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        var mioPasso=fields.session_id+'_'+fields.step_id;
        egp.get(mioPasso,function(err,risu) {
            if(err) {
                console.log("ERROR GETTING PASSO: "+JSON.stringify(err));
            }
            else {
                risu.rating=fields.rating;
                console.log("ADDING RATING TO STEP:"+fields.rating);
                egp.insert(risu,function(err,resu){
                    if(err) console.log("ERROR ADDING RATE: "+JSON.stringify(err));
                    else console.log("STEP UPDATED");
                });
            }
        })
    });
    res.send({"status":1,"rating":"OK"});
});
// -----------------------------------------
// add annotation to a session control
// -----------------------------------------
app.post('/step_note',function(req,res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        var mioPasso=fields.session_id+'_'+fields.step_id;
        egp.get(mioPasso,function(err,risu) {
            if(err) {
                console.log("ERROR GETTING PASSO: "+JSON.stringify(err));
            }
            else {
                risu.notes=fields.notes;
                console.log("ADDING NOTES TO STEP:"+fields.notes);
                egp.insert(risu,function(err,resu){
                    if(err) console.log("ERROR ADDING NOTES: "+JSON.stringify(err));
                    else console.log("STEP UPDATED");
                });
            }
        })
    });
    res.send({"status":1,"note":"OK"});
});

// -----------------------------------------
// fai photo
// -----------------------------------------
app.get('/faifoto',function(req,res){
    var yyy=req.query.xxx;
    console.log("SESSION ID: "+yyy)
//    res.render('faifoto');
    res.send({"status":1,"faifoto":yyy});
});
// -----------------------------------------
// add a photo to a session control
// -----------------------------------------
app.post('/savefoto',function(req,res) {
    var fix="";    
    var form = new formidable.IncomingForm();
//    form.uploadDir = "c:\\tmp";
    form.parse(req, function(err, fields, files) {
        console.log("Ricevuto file "+files.file.name);   
        console.log("SESSION_ID: "+JSON.stringify(fields)); 
        var fotoDoc= 'photo_'+fields.uid+'_'+new Date().getTime();
        var mioPasso=fields.session_id+'_'+fields.step_id;
        console.log("MIOPASSO: "+mioPasso);
        console.log("PATH:" +files.file.path);     
        fs.readFile(files.file.path, function(err, data) {
            if (err) {
                console.log("ERRORE FILE: "+JSON.stringify(err));
            }
            else {
                console.log("GOT FILE");
                egp.multipart.insert({ type:'photo'}, 
                [{name: 'photo.jpg', data: data, content_type: 'image/jpeg'}], 
                fotoDoc, function(err, body) {
                    if (err) {
                        console.log("ERRORE CREATE PHOTO: "+JSON.stringify(err));
                    }
                    else {
                        console.log("FOTO CREATA, CERCO PASSO");
                        egp.get(mioPasso,function(err,risu) {
                            if(err) {
                                console.log("ERROR GETTING PASSO: "+JSON.stringify(err));
                            }
                            else {
                                console.log("PASSO DA EDITARE:"+JSON.stringify(risu));
                                risu.photo=fotoDoc;
                                console.log("PASSO EDITATO:"+JSON.stringify(risu));
                                egp.insert(risu,function(err,resu){
                                    if(err) console.log("ERROR UPDATE: "+JSON.stringify(err));
                                    else console.log("STEP UPDATED");
                                });
                            }
                        })
                    }                   
                });
            }
        });
    });
    res.send({"status":1,"file":"OK"});
});
//----------------------------------------------------------------------
// End of routes
//----------------------------------------------------------------------
//
//----------------------------------------------------------------------
// Function CreateSteps
// Create all controls of a session starting from a template checklist
// ---------------------------------------------------------------------
  function createSteps(session_id,template_id, descri) {
    return new Promise(function(resolve, reject) {
        var elencoPassi=[];
        var indi=0;
        console.log("creating steps for "+session_id+" basing on checklist "+template_id);
        egp.find({selector: {type: 'step',checklist_id:template_id},
            fields: ['_id', 'step_desc']
        },function(er,result) {
            console.log('Trovati '+result.docs.length+' step');
            result.docs.forEach(function(step) {
                indi++;
                elencoPassi.push(step.step_desc);
                var x=egp.insert({_id:  session_id+"_"+indi,type: 'session_step',
                session:session_id,step_desc:step.step_desc,status:0}, 
                function(err, result) {
                    if(err) {
                        console.log("Error saving step: "+JSON.stringify(err));
                        reject(err);
                    }
                    else {
                        console.log('Saved step '+session_id+"_"+indi);
                    }                    
                });                 
            })
    // after creating steps, create parent session
    // if no steps are created, don't create parent.
            if(indi==0) {
                reject("No step found");
            }
            else {
                var xx=egp.insert(
                {
                    _id:  session_id,type: 'session',checklist_id:template_id,
                    checklist_description:descri,operator:uid,plant: curSite==null ? "" : curSite._id,
                    turbine: 'WTG 2',create_date: new Date().toLocaleString(),status:1},
                    function (err, resu) 
                    {
                        if(err) {
                            reject("Error in creating session");
                        }
                        else {
                            console.log("Saved session "+session_id);  
//                            console.log("Passi: "+elencoPassi); 
                            resolve(elencoPassi);               
                        }
                    }
                );
            }
        });
    });
  }  
//----------------------------------------
// Create a new session with status=1;
//----------------------------------------
function createSessionFromCheckList(ide,descri) {
    return new Promise(function(resolve, reject) {
        curSession=uid+'_'+new Date().getTime();
        createSteps(curSession,ide,descri)
        .then(function(passi) {
            console.log("CreateSessionStep - Passi: "+JSON.stringify(passi));
            resolve(passi);
        })
        .catch(function(err) {
            console.log ("CreteSessionFromCL - ERROR: "+err);
            reject(err);
        })
    });
}
//---------------------------------------
// Get the list of controls
//---------------------------------------
function getSteps(session_id) {
    if(IsNull(session_id)) {
        egp.find({selector: {type: 'session',operator:uid}},
        function(er,result){
            if(result.docs.length>0) {
                return getSessionSteps(result.docs[0]._id);
            }
            else return {};
        })
    }
    else return getSessionSteps(session_id);
}

function getSessionSteps(session_id) {
    var elencoPassi=[];
    egp.find({selector: {type: 'session_step',session:session_id},
        fields: ['_id', 'step_desc']
    },function(er,result) {
        console.log('Trovati '+result.docs.length+' step');
        result.docs.forEach(function(step) {
            elencoPassi.push(step.step_desc);
        });
        return elencoPassi;
    });
}
//------------------------------------------
// Web Server start lisening to http port
//------------------------------------------
var porta=process.env.PORT || 3000;
app.listen(porta, function () {
  console.log('Cloudant started on port '+porta)
})