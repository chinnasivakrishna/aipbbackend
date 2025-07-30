const mongoose = require('mongoose');

const subjectiveTestSchema =  new mongoose.Schema({
    name:{
        type:String,
        required:true,
        default:""
    },
    clientId:{
        type:String,
        required:true
    },
    description:{
        type:String,
        default:""
    },
    Estimated_time:{
        type:String,
        default:""
    },
    imageKey:{
        type:String,
        default:""
    },
    imageUrl:{
        type:String,
        default:""
    },
    isTrending:{
        type:Boolean,
        default:false
    },
    isHighlighted:{
        type:Boolean,
        default:false
    },
    isActive:{
        type:Boolean,
        default:true
    },
    instructions:{
        type:String,
        default:""
    },
    questions:{
        type:Array,
        default:[]
    }
},
{timestamps:true});

module.exports = mongoose.model('SubjectiveTest', subjectiveTestSchema);